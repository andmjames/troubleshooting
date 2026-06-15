// Background manual processor.
//
// Triggered after an employee uploads a manual PDF through the app. For each page
// it renders a PNG (so the troubleshooter can SHOW the page), extracts the text
// layer, and asks Claude Haiku for a one-line description — this is what makes the
// scanned assembly drawings (no text layer) findable.
//
// Rendering + text extraction use `mupdf` (a WebAssembly build — no poppler, no
// native canvas, works inside a Netlify Node function).
//
// To stay under Netlify's 15-minute background limit on very long manuals, this
// processes pages in CHUNKS and re-invokes itself for the next chunk until done.
const { admin } = require('./_shared');
const mupdf = require('mupdf');

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const CHUNK = 25;          // pages per invocation
const DPI = 110;           // render resolution
const SUMMARY_CONCURRENCY = 4;

async function describePage(pngBuffer, machineName, textSample) {
  const prompt = `This is one page from an equipment manual for a "${machineName}". Write ONE short line (max 40 words) describing what's on it so a maintenance tech can find it by searching. Name any assembly, part numbers, diagram type, or procedure shown. If it's mostly a drawing, say what mechanism it depicts.`;
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 120,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: pngBuffer.toString('base64') } },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  });
  if (!res.ok) return '';
  const data = await res.json();
  return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim();
}

// Render + extract one page with mupdf.
function renderPage(doc, pageIndex) {
  const page = doc.loadPage(pageIndex);
  // Text layer
  let text = '';
  try {
    const st = page.toStructuredText('preserve-whitespace');
    text = st.asText() || '';
  } catch { text = ''; }
  // Render to PNG at the chosen DPI
  const scale = DPI / 72;
  const matrix = mupdf.Matrix.scale(scale, scale);
  const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false, true);
  const png = pixmap.asPNG();           // Uint8Array
  return { text: text.trim(), png: Buffer.from(png) };
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
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

  try {
    if (startPage === 1) {
      await sb.from('et_manuals').update({ status: 'processing', error: null }).eq('id', manualId);
    }

    // Download the PDF from storage
    const { data: file, error: dlErr } = await sb.storage.from('manuals').download(manual.storage_path);
    if (dlErr) throw new Error(`download failed: ${dlErr.message}`);
    const pdfBuffer = Buffer.from(await file.arrayBuffer());

    const doc = mupdf.Document.openDocument(pdfBuffer, 'application/pdf');
    const pageCount = doc.countPages();
    if (!manual.page_count) {
      await sb.from('et_manuals').update({ page_count: pageCount }).eq('id', manualId);
    }

    const endPage = Math.min(startPage + CHUNK - 1, pageCount);

    // Build this chunk's page numbers
    const pageNums = [];
    for (let p = startPage; p <= endPage; p++) pageNums.push(p);

    // Render all pages in the chunk (synchronous mupdf), then summarize with limited concurrency
    const rendered = pageNums.map((p) => {
      const r = renderPage(doc, p - 1);
      return { page: p, ...r };
    });

    await mapLimit(rendered, SUMMARY_CONCURRENCY, async (r) => {
      let summary = '';
      try { summary = await describePage(r.png, manual.title, r.text); } catch { summary = ''; }
      const imgPath = `${manualId}/p${String(r.page).padStart(4, '0')}.png`;
      const up = await sb.storage.from('manual-pages')
        .upload(imgPath, r.png, { contentType: 'image/png', upsert: true });
      await sb.from('et_manual_pages').insert({
        manual_id: manualId,
        machine_id: manual.machine_id,
        page_number: r.page,
        text_content: r.text || null,
        ai_summary: summary || null,
        image_path: up.error ? null : imgPath,
      });
    });

    await sb.from('et_manuals').update({ pages_done: endPage }).eq('id', manualId);

    if (endPage < pageCount) {
      // More to do — re-invoke ourselves for the next chunk.
      const base = process.env.URL || `https://${event.headers.host}`;
      fetch(`${base}/.netlify/functions/manual-process-background`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manualId, startPage: endPage + 1 }),
      }).catch(() => {});
    } else {
      await sb.from('et_manuals').update({ status: 'ready' }).eq('id', manualId);
    }
  } catch (e) {
    await sb.from('et_manuals').update({ status: 'error', error: String(e.message || e) }).eq('id', manualId);
  }

  return { statusCode: 202, body: 'processing' };
};
