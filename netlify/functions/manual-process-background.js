// Background manual processor (v3 — one page per call for exact page alignment).
//
// v2 summarized 15-page batches and mapped summaries to pages by array position.
// If Claude returned fewer items (e.g. skipped a near-blank page) or shifted order,
// every later summary in the batch landed on the WRONG page number — so a
// "troubleshooting" summary could end up tagged to a parts-list page. That made the
// troubleshooter cite/show the wrong manual page.
//
// This version summarizes ONE page per Claude request, so each summary is bound to
// its exact page number with no positional guessing. Pages are processed in small
// concurrent batches for speed, with the same time-budget re-invoke for big manuals.
const { admin, callClaude } = require('./_shared');
const { PDFDocument } = require('pdf-lib');

const BATCH = 5;                  // pages summarized concurrently per round
const MODEL = 'claude-haiku-4-5-20251001';

// Extract a single page as its own PDF (bytes). Done sequentially — pdf-lib isn't
// safe to use concurrently on one source document.
async function extractPageBytes(src, pageIndex) {
  const one = await PDFDocument.create();
  const [copied] = await one.copyPages(src, [pageIndex]);
  one.addPage(copied);
  return one.save();
}

// Summarize a single page (given its PDF bytes). Returns a string (or null).
async function summarizePageBytes(bytes, machineName) {
  const b64 = Buffer.from(bytes).toString('base64');
  const prompt = `This is a single page from an equipment manual for a "${machineName}". Write a concise searchable summary (max ~55 words) capturing: part numbers, assembly/component names, the kind of content (parts diagram, wiring schematic, step-by-step procedure, parts list, troubleshooting table, threading diagram, etc.), and key visible text — so a maintenance tech can find this exact page by searching. If the page is essentially blank, reply with "(blank page)". Return ONLY the summary text, no preamble.`;
  const data = await callClaude({
    model: MODEL,
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
        { type: 'text', text: prompt },
      ],
    }],
  });
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim();
  return text || null;
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

    let cursor = startPage;            // 1-based page to process next
    while (cursor <= pageCount) {
      const batchEnd = Math.min(cursor + BATCH - 1, pageCount);
      const pageNums = [];
      for (let p = cursor; p <= batchEnd; p++) pageNums.push(p);

      // Step 1: extract each page's bytes sequentially (pdf-lib, single source doc).
      const pageBytes = [];
      for (const pn of pageNums) {
        try { pageBytes.push({ pn, bytes: await extractPageBytes(src, pn - 1) }); }
        catch { pageBytes.push({ pn, bytes: null }); }
      }

      // Step 2: summarize the pages concurrently. Each result keeps its exact page
      // number, so a summary can never drift onto the wrong page.
      const rows = await Promise.all(pageBytes.map(async ({ pn, bytes }) => {
        let summary = null;
        if (bytes) {
          try { summary = await summarizePageBytes(bytes, manual.title || 'machine'); }
          catch { summary = null; }
        }
        if (summary && /^\(?\s*blank page\s*\)?$/i.test(summary.trim())) summary = null;
        return {
          manual_id: manualId,
          machine_id: manual.machine_id,
          page_number: pn,
          ai_summary: summary,
          text_content: summary,
          image_path: null,
        };
      }));

      await sb.from('et_manual_pages').insert(rows);
      await sb.from('et_manuals').update({ pages_done: batchEnd }).eq('id', manualId);

      cursor = batchEnd + 1;

      // If there's more to do and we're running low on time, hand the rest to a
      // fresh invocation. AWAIT the trigger so it's actually sent before we return.
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
