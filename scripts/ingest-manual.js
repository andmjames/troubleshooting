#!/usr/bin/env node
/*
 * Manual ingestion pipeline.
 *
 * For one manual PDF this script:
 *   1. uploads the original PDF to the `manuals` bucket
 *   2. extracts the text layer per page (pdftotext)
 *   3. renders each page to a PNG and uploads to `manual-pages`
 *   4. asks Claude Haiku to describe each page image (critical for the
 *      scanned assembly drawings that have no usable text layer)
 *   5. inserts et_manuals + et_manual_pages rows (search vectors auto-fill)
 *
 * Requirements on your Mac (one-time):
 *   brew install poppler          # gives pdftotext + pdftoppm
 *   npm install @supabase/supabase-js
 *
 * Environment (same keys as the Netlify functions):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
 *
 * Usage:
 *   node scripts/ingest-manual.js \
 *     --pdf "./Shanklin_A26A_Manual.pdf" \
 *     --machine "Shanklin L Bar Sealer" \
 *     --title "Shanklin A26A Operation & Maintenance Manual"
 *
 * Tip: model numbers live on each machine row (et_machines.model_number).
 *      You set those once; you do NOT need to pass them per manual.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { createClient } = require('@supabase/supabase-js');

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}

const PDF = arg('pdf');
const MACHINE = arg('machine');
const TITLE = arg('title') || (PDF ? path.basename(PDF) : null);
const DPI = parseInt(arg('dpi', '120'), 10);

if (!PDF || !MACHINE) {
  console.error('Usage: node scripts/ingest-manual.js --pdf <file> --machine "<machine name>" [--title "<title>"] [--dpi 120]');
  process.exit(1);
}
for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ANTHROPIC_API_KEY']) {
  if (!process.env[k]) { console.error(`Missing env var ${k}`); process.exit(1); }
}

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function sh(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 64 });
}

async function describePage(pngPath, textSample) {
  const b64 = fs.readFileSync(pngPath).toString('base64');
  const prompt = `This is one page from an equipment manual for a "${MACHINE}". Write ONE short paragraph (max 60 words) describing what's on this page so a maintenance tech can find it by searching. Name any assembly, part numbers, diagram type, or procedure shown. If it's mostly a drawing, say what mechanism it depicts. Text layer sample (may be empty for scanned drawings): "${(textSample || '').slice(0, 200)}"`;

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: b64 } },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  });
  if (!res.ok) {
    console.warn(`  ! describe failed (${res.status}); leaving summary blank`);
    return '';
  }
  const data = await res.json();
  return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim();
}

(async () => {
  // Resolve machine
  const { data: machine, error: mErr } = await sb
    .from('et_machines').select('id, name').eq('name', MACHINE).single();
  if (mErr || !machine) { console.error(`Machine "${MACHINE}" not found in et_machines.`); process.exit(1); }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-'));
  console.log(`Working dir: ${tmp}`);

  // Page count
  const info = sh('pdfinfo', [PDF]);
  const pageCount = parseInt((info.match(/Pages:\s+(\d+)/) || [])[1] || '0', 10);
  console.log(`${TITLE}: ${pageCount} pages`);

  // 1. Upload original PDF
  const storagePath = `${machine.id}/${Date.now()}-${path.basename(PDF).replace(/[^\w.-]/g, '_')}`;
  const pdfBytes = fs.readFileSync(PDF);
  const up = await sb.storage.from('manuals').upload(storagePath, pdfBytes, { contentType: 'application/pdf' });
  if (up.error) { console.error('PDF upload failed:', up.error.message); process.exit(1); }

  // Insert manual row
  const { data: manual, error: manErr } = await sb.from('et_manuals')
    .insert({ machine_id: machine.id, title: TITLE, storage_path: storagePath, page_count: pageCount, status: 'processing' })
    .select().single();
  if (manErr) { console.error('Manual insert failed:', manErr.message); process.exit(1); }

  // 2. Extract per-page text
  const txtDir = path.join(tmp, 'txt');
  fs.mkdirSync(txtDir);

  // 3+4+5. Render, describe, insert — one page at a time to keep memory low
  for (let p = 1; p <= pageCount; p++) {
    // text
    let text = '';
    try { text = sh('pdftotext', ['-f', String(p), '-l', String(p), '-layout', PDF, '-']); }
    catch { text = ''; }

    // image
    const prefix = path.join(tmp, `pg`);
    sh('pdftoppm', ['-png', '-r', String(DPI), '-f', String(p), '-l', String(p), PDF, prefix]);
    const rendered = fs.readdirSync(tmp).find((f) => f.startsWith('pg') && f.endsWith('.png'));
    const pngPath = path.join(tmp, rendered);

    // describe (vision)
    let summary = '';
    try { summary = await describePage(pngPath, text); }
    catch (e) { console.warn(`  ! describe error p.${p}: ${e.message}`); }

    // upload page image
    const imgPath = `${manual.id}/p${String(p).padStart(4, '0')}.png`;
    const imgBytes = fs.readFileSync(pngPath);
    const iu = await sb.storage.from('manual-pages').upload(imgPath, imgBytes, { contentType: 'image/png', upsert: true });
    fs.unlinkSync(pngPath);
    if (iu.error) console.warn(`  ! image upload p.${p}: ${iu.error.message}`);

    // insert page row
    const { error: pErr } = await sb.from('et_manual_pages').insert({
      manual_id: manual.id,
      machine_id: machine.id,
      page_number: p,
      text_content: text.trim() || null,
      ai_summary: summary || null,
      image_path: iu.error ? null : imgPath,
    });
    if (pErr) console.warn(`  ! page insert p.${p}: ${pErr.message}`);

    if (p % 10 === 0 || p === pageCount) console.log(`  …${p}/${pageCount}`);
  }

  await sb.from('et_manuals').update({ status: 'ready' }).eq('id', manual.id);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`Done. Manual #${manual.id} ingested for ${machine.name}.`);
})().catch((e) => { console.error(e); process.exit(1); });
