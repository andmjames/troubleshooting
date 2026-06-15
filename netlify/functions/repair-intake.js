// Repair intake helper.
// Given a problem + solution the technician just wrote, ask Claude whether a few
// short extra details would make this log more useful for future troubleshooting.
// Returns 0–4 short questions. Kept deliberately small (well under "2 minutes").
const { callClaude, textOf, json } = require('./_shared');

const SYSTEM = `You review repair logs for a tape factory's maintenance system. A technician just logged a problem and how they fixed it. Your job: decide if a FEW short follow-up questions would make this log more useful when someone hits the same problem later.

Return ONLY a JSON array of question strings — no prose, no markdown, no code fences.
- Ask 0 to 3 questions, never more.
- Only ask things that genuinely help future diagnosis: specific part numbers/names used, a setting/measurement value, where on the machine, or how the fault first showed up.
- If the log is already clear enough, return [].
- Keep each question under 12 words. A technician should answer all of them in under a minute.`;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch { return json(400, { error: 'Bad JSON' }); }

  const { machineName, problem, solution, details } = payload;
  if (!problem || !solution) return json(400, { error: 'Missing problem or solution' });

  const user = `Machine: ${machineName}
Problem: ${problem}
Fix: ${solution}
${details ? 'Details already given: ' + details : ''}

Return the JSON array of follow-up questions now.`;

  try {
    const data = await callClaude({
      model: 'claude-sonnet-4-6',
      system: SYSTEM,
      messages: [{ role: 'user', content: user }],
      max_tokens: 400,
    });
    let raw = textOf(data).replace(/```json|```/g, '').trim();
    let questions = [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) questions = parsed.filter((q) => typeof q === 'string').slice(0, 3);
    } catch {
      questions = [];
    }
    return json(200, { questions });
  } catch (e) {
    // Non-fatal: the client treats a failure as "no questions, just save".
    return json(200, { questions: [] });
  }
};
