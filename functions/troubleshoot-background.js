// Background troubleshooting worker.
//
// Netlify runs any function whose filename ends in `-background` asynchronously:
// it returns 202 immediately and may run up to 15 minutes. It can't return data
// to the caller, so it writes its result into the et_troubleshoot_jobs row, which
// the chat UI polls.
//
// Flow: the browser inserts a job row (status 'pending') and then POSTs { jobId }
// here. We load the job, do the work, and update the row to 'done' or 'error'.
//
// Strategy (unchanged from the original synchronous version):
//   1. Use the latest user message as the search query.
//   2. Search repair logs (PRIORITIZED) and manual pages for this machine.
//   3. Hand Claude the logs + manual text + image descriptions, with web_search
//      enabled, and ask for a SHORT bulleted answer that leans on past repairs.
//   4. Store the answer plus source chips and relevant manual-page / repair photos.
const { admin, callClaude, textOf, sign } = require('./_shared');

const SYSTEM = `You are a maintenance troubleshooting assistant for PMI Tape, a tape manufacturing plant. You help technicians fix factory equipment.

RULES — follow exactly:
- ALWAYS prioritize the PAST REPAIR LOGS provided. If a past repair matches the problem, lead with it: say what was wrong before and how it was fixed, and reference it (e.g. "Past repair from 3/14: …").
- After the logs, use the MANUAL EXCERPTS, then general/web knowledge.
- When you search the web, include the machine's MANUFACTURER and MODEL NUMBER in your query (e.g. "<manufacturer> <model> <problem>"), so results are specific to this exact equipment rather than a generic machine name.
- Keep it SHORT. A few bullet points only. Do not overwhelm the technician.
- Each bullet is one concrete thing to check or do, most likely cause first.
- Plain shop-floor language. No long preambles, no safety lectures unless a step is genuinely dangerous (then one short caution).
- If you genuinely need one piece of info to narrow it down, ask a single short question instead of guessing.
- Never invent part numbers, log dates, or manual pages. Only cite what you were given.
- When you reference a manual page, cite the exact page number shown in the MANUAL EXCERPTS above (e.g. "p.77"). Do NOT cite a manual page number that does not appear in those excerpts — if the excerpts don't cover it, describe the step without a page citation.`;

async function runJob(sb, job) {
  const { machineName, messages = [] } = job.payload || {};
  const machineId = job.machine_id;

  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const query = (lastUser?.content || '').trim();
  if (!query) throw new Error('No user question in payload');

  // Pull the machine's make/model/serial so web searches can be specific to this equipment.
  let machineInfo = { manufacturer: null, model_number: null, serial_number: null };
  try {
    const { data: mrow } = await sb
      .from('et_machines')
      .select('manufacturer, model_number, serial_number')
      .eq('id', machineId)
      .single();
    if (mrow) machineInfo = mrow;
  } catch { /* fall back to name only */ }

  // 1+2. Search repair logs (prioritized) and manual pages in parallel
  const [logsRes, pagesRes] = await Promise.all([
    sb.rpc('et_search_repair_logs', { p_machine_id: machineId, p_query: query, p_limit: 6 }),
    sb.rpc('et_search_manual_pages', { p_machine_id: machineId, p_query: query, p_limit: 8 }),
  ]);
  const logs = logsRes.data || [];
  const pages = pagesRes.data || [];

  // 2. Build the context block
  let context = '';
  if (logs.length) {
    context += '=== PAST REPAIR LOGS (prioritize these) ===\n';
    logs.forEach((l, i) => {
      const date = l.created_at ? new Date(l.created_at).toLocaleDateString() : 'unknown date';
      context += `\n[LOG ${i + 1}] (${date}${l.technician ? ', by ' + l.technician : ''})\n`;
      context += `Problem: ${l.problem}\n`;
      if (l.solution) context += `Fix: ${l.solution}\n`;
      if (l.details) context += `Details: ${l.details}\n`;
    });
    context += '\n';
  } else {
    context += '=== PAST REPAIR LOGS ===\n(none recorded yet for this machine)\n\n';
  }
  if (pages.length) {
    context += '=== MANUAL EXCERPTS ===\n';
    pages.forEach((p) => {
      const body = (p.text_content || '').slice(0, 900);
      const desc = p.ai_summary ? ` — ${p.ai_summary}` : '';
      context += `\n[MANUAL "${p.manual_title}" p.${p.page_number}]${desc}\n${body}\n`;
    });
    context += '\n';
  }

  const convo = messages.map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
  }));
  while (convo.length && convo[0].role === 'assistant') convo.shift();
  const lastIdx = convo.map((m) => m.role).lastIndexOf('user');
  const machineLine = [
    `Machine: ${machineName}`,
    machineInfo.manufacturer ? `Manufacturer: ${machineInfo.manufacturer}` : null,
    machineInfo.model_number ? `Model number: ${machineInfo.model_number}` : null,
  ].filter(Boolean).join('\n');

  const webHint = (machineInfo.manufacturer || machineInfo.model_number)
    ? `\n\nWhen searching the web, use "${[machineInfo.manufacturer, machineInfo.model_number].filter(Boolean).join(' ')}" plus the problem in your query.`
    : '';

  // Photos the technician attached to their latest message — pull them from storage
  // and hand them to Claude as image blocks so it can diagnose from what it sees.
  const imageBlocks = [];
  const imgPaths = Array.isArray(lastUser?.imagePaths) ? lastUser.imagePaths.filter(Boolean).slice(0, 6) : [];
  for (const p of imgPaths) {
    try {
      const { data: f, error: e } = await sb.storage.from('repair-photos').download(p);
      if (e || !f) continue;
      const buf = Buffer.from(await f.arrayBuffer());
      if (buf.length > 5 * 1024 * 1024) continue; // stay under the per-image limit
      const ext = (p.split('.').pop() || 'jpg').toLowerCase();
      const media = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      imageBlocks.push({ type: 'image', source: { type: 'base64', media_type: media, data: buf.toString('base64') } });
    } catch { /* skip a photo that won't load */ }
  }

  const photoHint = imageBlocks.length
    ? `\n\nThe technician attached ${imageBlocks.length} photo${imageBlocks.length > 1 ? 's' : ''} — examine ${imageBlocks.length > 1 ? 'them' : 'it'} closely (leaks, damage, wear, error displays, part condition, wiring) and factor what you see into your diagnosis.`
    : '';

  const userText = `${context}=== TECHNICIAN'S MESSAGE ===\n${machineLine}\n${query}\n\nGive a short, bulleted answer. Lead with any matching past repair.${webHint}${photoHint}`;

  convo[lastIdx] = imageBlocks.length
    ? { role: 'user', content: [...imageBlocks, { type: 'text', text: userText }] }
    : { role: 'user', content: userText };

  // 3. Ask Claude, with web search available
  const data = await callClaude({
    model: 'claude-sonnet-4-6',
    system: SYSTEM,
    messages: convo,
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
    max_tokens: 1200,
  });
  const answer = textOf(data);

  // 4. Assemble source chips + images.
  // Repair photos come back as signed image URLs. Manual pages come back as a
  // reference to the PDF + page number, which the browser renders with pdf.js.
  //
  // Only show the manual pages the answer actually cites (e.g. "p.130"), and only
  // when that page was among the ones we retrieved into context — so every thumbnail
  // matches what the answer is talking about, instead of whatever ranked highest in
  // the text search. (Showing a page the answer never references was the source of
  // the "irrelevant thumbnails" problem.)
  const citedPages = new Set();
  const pageRe = /(?:\bp\.?\s*|\bpages?\s+|\bpg\.?\s*)(\d{1,4})\b/gi;
  let pm;
  while ((pm = pageRe.exec(answer)) !== null) citedPages.add(parseInt(pm[1], 10));

  const sources = [];
  const images = [];

  for (const l of logs.slice(0, 3)) {
    const date = l.created_at ? new Date(l.created_at).toLocaleDateString() : '';
    sources.push({ type: 'log', label: `Repair log · ${date}` });
    const photos = [...(l.problem_photos || []), ...(l.solution_photos || [])];
    for (const ph of photos.slice(0, 2)) {
      const url = await sign(sb, 'repair-photos', ph.path);
      if (url) images.push({ kind: 'photo', url });
    }
  }

  const citedManualPages = pages.filter((p) => citedPages.has(p.page_number));
  const pdfUrlCache = {};
  for (const p of citedManualPages) {
    sources.push({ type: 'manual', label: `${p.manual_title} · p.${p.page_number}` });
    if (p.storage_path) {
      if (!(p.storage_path in pdfUrlCache)) {
        pdfUrlCache[p.storage_path] = await sign(sb, 'manuals', p.storage_path, 3600);
      }
      const url = pdfUrlCache[p.storage_path];
      if (url) images.push({ kind: 'manual-page', url, page: p.page_number, label: `${p.manual_title} · p.${p.page_number}` });
    }
  }

  const seen = new Set();
  const uniqueImages = images.filter((im) => {
    const k = im.kind === 'manual-page' ? `${im.url}#${im.page}` : im.url;
    if (!k || seen.has(k)) return false;
    seen.add(k); return true;
  }).slice(0, 6);

  return { answer, sources, images: uniqueImages };
}

exports.handler = async (event) => {
  let jobId;
  try { jobId = JSON.parse(event.body || '{}').jobId; }
  catch { return { statusCode: 400, body: 'Bad JSON' }; }
  if (!jobId) return { statusCode: 400, body: 'Missing jobId' };

  const sb = admin();
  const { data: job, error } = await sb
    .from('et_troubleshoot_jobs').select('*').eq('id', jobId).single();
  if (error || !job) return { statusCode: 404, body: 'Job not found' };

  await sb.from('et_troubleshoot_jobs')
    .update({ status: 'running', updated_at: new Date().toISOString() }).eq('id', jobId);

  try {
    const result = await runJob(sb, job);
    await sb.from('et_troubleshoot_jobs')
      .update({ status: 'done', result, updated_at: new Date().toISOString() }).eq('id', jobId);
  } catch (e) {
    await sb.from('et_troubleshoot_jobs')
      .update({ status: 'error', error: String(e.message || e), updated_at: new Date().toISOString() })
      .eq('id', jobId);
  }
  // Background functions return 202; body is ignored.
  return { statusCode: 202, body: 'processing' };
};
