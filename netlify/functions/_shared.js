// Shared helpers for the troubleshooting app's Netlify Functions.
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

// Service-role client — bypasses RLS, server-side only.
function admin() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

// Call Claude. `opts` may include tools (e.g. web_search) and system.
async function callClaude({ model = 'claude-sonnet-4-6', system, messages, tools, max_tokens = 1500 }) {
  const body = { model, max_tokens, messages };
  if (system) body.system = system;
  if (tools) body.tools = tools;

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Anthropic ${res.status}: ${txt.slice(0, 300)}`);
  }
  return res.json();
}

// Pull all text blocks out of a Claude response and join them.
function textOf(data) {
  return (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

// Create a short-lived signed URL for a private storage object.
async function sign(sb, bucket, path, expiresIn = 3600) {
  if (!path) return null;
  const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) return null;
  return data?.signedUrl || null;
}

const json = (statusCode, obj) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(obj),
});

module.exports = { admin, callClaude, textOf, sign, json };
