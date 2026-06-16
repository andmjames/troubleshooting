// Background manual processor (v2 — no native/WASM rendering).
//
// Earlier this used `mupdf` to rasterize pages, which crashed on load in the
// Netlify Lambda runtime (leaving manuals stuck at "pending"). This version has
// no rendering library at all:
//   1. `pdf-lib` (pure JS) splits the PDF into small page-range chunks.
//   2. Claude reads each chunk natively (its vision handles scanned drawings that
//      have no text layer) and returns a concise, searchable summary per page.
//   3. Summaries go into et_manual_pages.ai_summary, which the FTS trigger indexes.
//
// Chunks are processed CHUNK_PAGES at a time; the function re-invokes itself for
// the next chunk so even a 400-page manual stays within the 15-minute limit.
const { admin, callClaude } = require('./_shared');
const { PDFDocument } = require('pdf-lib');

const CHUNK_PAGES = 15;            // pages per Claude request (well under the 100-page limit)
const MODEL = 'claude-haiku-4-5-20251001';

function parseJsonArray(text) {
  if (!text) return [];
  let t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = t.indexOf('[');
  const end = t.lastIndexOf(']');
  if (start !== -1 && end !== -1 && end > start) t = t.slice(start, end + 1);
  try { return JSON.parse(t); } catch { return []; }
}

async function summarizeChunk(subBytes, startPage, count, machineName) {
  const b64 = Buffer.from(subBytes).toString('base64');
  const prompt = `These are pages ${startPage}–${startPage + count - 1} of an equipment manual for a "${machineName}". There are ${count} pages in this batch, in order.

For EACH page, write a concise searchable summary (max ~50 words) capturing: part numbers, assembly/component names, the type of content (e.g. parts diagram, wiring schematic, procedure, parts list), and any key visible text — so a maintenance tech can find this page by searching.

Return ONLY a JSON array of exactly ${count} objects in page order, no prose, no code fences:
[{"summary":"..."}, {"summary":"..."}, ...]`;

  const data = await callClaude({
    model: MODEL,
    max_tokens: 2500,
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
        { type: 'text', text: prompt },
      ],
    }],
  });
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  return parseJsonArray(text);
}

exports.handler = async (event) => {
  let manualId, startPage;
  try {
    const body = JSON.parse(event.body || '{}');
    manualId = body.manualId;
    startPage = body.startPage || 1;   // 1-based
  } catch { return { statusCode: 400, body: 'Bad JSON' }; }
  if (!manualId) return { statusCode: 400, body: 'Missing manualId' };

  const sb = admin();
  const { data: manual, error } = await sb.from('et_manuals').select('*').eq('id', manualId).single();
  if (error || !manual) return { statusCode: 404, body: 'Manual not found' };

  // Re-invoke before approaching the 15-minute background-function cap, so a large
  // manual is split across a few invocations. Most manuals finish in one run.
  const RUN_BUDGET_MS = 8 * 60 * 1000;
  const t0 = Date.now();

  try {
    if (startPage === 1) {
      await sb.from('et_manuals').update({ status: 'processing', error: null }).eq('id', manualId);
    }

    const { data: file, error: dlErr } = await sb.storage.from('manuals').download(manual.storage_path);
    if (dlErr) throw new Error(`download failed: ${dlErr.message}`);
    const pdfBytes = new Uint8Array(await file.arrayBuffer());

    const src = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const pageCount = src.getPageCount();
    if (!manual.page_count) {
      await sb.from('et_manuals').update({ page_count: pageCount }).eq('id', manualId);
    }

    let cursor = startPage;            // 1-based page to start this chunk
    while (cursor <= pageCount) {
      const endPage = Math.min(cursor + CHUNK_PAGES - 1, pageCount);
      const count = endPage - cursor + 1;

      // Build a sub-PDF with just this chunk's pages.
      const sub = await PDFDocument.create();
      const indices = [];
      for (let p = cursor - 1; p <= endPage - 1; p++) indices.push(p);
      const copied = await sub.copyPages(src, indices);
      copied.forEach((pg) => sub.addPage(pg));
      const subBytes = await sub.save();

      // Ask Claude for one summary per page (by order).
      let summaries = [];
      try { summaries = await summarizeChunk(subBytes, cursor, count, manual.title || 'machine'); }
      catch (e) { summaries = []; /* keep going; store blank summaries for this chunk */ }

      const rows = [];
      for (let i = 0; i < count; i++) {
        const summary = (summaries[i] && (summaries[i].summary || summaries[i].text)) || null;
        rows.push({
          manual_id: manualId,
          machine_id: manual.machine_id,
          page_number: cursor + i,
          ai_summary: summary,
          text_content: summary,
          image_path: null,
        });
      }
      if (rows.length) await sb.from('et_manual_pages').insert(rows);
      await sb.from('et_manuals').update({ pages_done: endPage }).eq('id', manualId);

      cursor = endPage + 1;

      // If there's more to do and we're running low on time, hand the rest to a
      // fresh invocation. AWAIT the trigger so it's actually sent before we return
      // (un-awaited work is killed the moment the handler returns).
      if (cursor <= pageCount && Date.now() - t0 > RUN_BUDGET_MS) {
        const base = process.env.URL || `https://${event.headers.host}`;
        const resp = await fetch(`${base}/.netlify/functions/manual-process-background`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ manualId, startPage: cursor }),
        });
        if (!resp.ok && resp.status !== 202) throw new Error(`re-invoke failed: ${resp.status}`);
        return { statusCode: 202, body: 'handed off' };
      }
    }

    await sb.from('et_manuals').update({ status: 'ready' }).eq('id', manualId);
  } catch (e) {
    await sb.from('et_manuals').update({ status: 'error', error: String(e.message || e) }).eq('id', manualId);
  }

  return { statusCode: 202, body: 'processing' };
};
