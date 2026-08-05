// Synchronous diagnostic endpoint for the troubleshooting worker.
//
// The real worker runs as a background function, so when it fails silently the
// chat can't tell whether (a) the worker's environment is broken or (b) the
// background function isn't being invoked at all. This endpoint runs the same
// environment checks synchronously and returns the result directly to the chat.
//
// It never returns secret VALUES — only whether each env var is present, and the
// text of any Supabase error (e.g. "Invalid API key").
const { admin } = require('./_shared');

exports.handler = async () => {
  const env = {
    SUPABASE_URL: !!process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
  };

  let supabase = 'not tested';
  try {
    const sb = admin();
    const { error } = await sb.from('et_troubleshoot_jobs').select('id').limit(1);
    supabase = error ? `error: ${error.message}` : 'ok';
  } catch (e) {
    supabase = `threw: ${String(e.message || e)}`;
  }

  const ok = env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && env.ANTHROPIC_API_KEY && supabase === 'ok';

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok, checks: { env, supabase } }),
  };
};
