import { createClient } from '@supabase/supabase-js';

const url = process.env.REACT_APP_SUPABASE_URL;
const anonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

export const supabase = createClient(url, anonKey);

// Machines list for the picker (shared by both flows)
export async function fetchMachines() {
  const { data, error } = await supabase
    .from('et_machines')
    .select('id, name, manufacturer, model_number')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

// Upload a photo to the repair-photos bucket; returns its storage path.
export async function uploadRepairPhoto(file) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `repairs/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from('repair-photos')
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return path;
}

// Turn a private storage path into a temporary viewable URL.
export async function signedUrl(bucket, path, expiresIn = 3600) {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);
  if (error) return null;
  return data?.signedUrl || null;
}

// Save a repair log row.
export async function saveRepairLog(row) {
  const { data, error } = await supabase
    .from('et_repair_logs')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Background troubleshooting: create a job, fire the worker, then poll ──
export async function createTroubleshootJob({ machineId, machineName, messages }) {
  const { data, error } = await supabase
    .from('et_troubleshoot_jobs')
    .insert({
      machine_id: machineId,
      status: 'pending',
      payload: { machineName, messages },
    })
    .select('id')
    .single();
  if (error) throw error;

  // Kick off the background worker (returns 202 immediately; we don't await its work).
  fetch('/.netlify/functions/troubleshoot-background', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId: data.id }),
  }).catch(() => {/* worker still picks it up via the row if this fetch is flaky */});

  return data.id;
}

// Poll a job until it's done or errors. Resolves with the result object.
export async function pollTroubleshootJob(jobId, { intervalMs = 1500, timeoutMs = 120000 } = {}) {
  const start = Date.now();
  // small helper
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  while (true) {
    const { data, error } = await supabase
      .from('et_troubleshoot_jobs')
      .select('status, result, error')
      .eq('id', jobId)
      .single();
    if (error) throw error;
    if (data.status === 'done') return data.result;
    if (data.status === 'error') throw new Error(data.error || 'Troubleshooting failed');
    if (Date.now() - start > timeoutMs) throw new Error('Timed out waiting for an answer');
    await wait(intervalMs);
  }
}

// List the manuals already attached to a machine (newest first).
export async function fetchManualsForMachine(machineId) {
  const { data, error } = await supabase
    .from('et_manuals')
    .select('id, title, status, page_count, pages_done, created_at')
    .eq('machine_id', machineId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// Count manuals per machine → { [machineId]: count } for the Edit Machines list.
export async function fetchManualCounts() {
  const { data, error } = await supabase.from('et_manuals').select('machine_id');
  if (error) return {};
  const counts = {};
  for (const r of data || []) counts[r.machine_id] = (counts[r.machine_id] || 0) + 1;
  return counts;
}

// Add a machine. Name is required and must be unique.
export async function addMachine({ name, manufacturer, model_number }) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('Machine name is required');

  // Place the new machine at the end of the list.
  const { data: maxRow } = await supabase
    .from('et_machines')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const sort_order = (maxRow?.sort_order || 0) + 10;

  const { data, error } = await supabase
    .from('et_machines')
    .insert({
      name: trimmed,
      manufacturer: (manufacturer || '').trim() || null,
      model_number: (model_number || '').trim() || null,
      sort_order,
    })
    .select()
    .single();
  if (error) {
    if (error.code === '23505') throw new Error(`A machine named "${trimmed}" already exists`);
    throw error;
  }
  return data;
}

// Remove a machine. Cascades to its manuals, manual pages, and repair logs.
// Storage cleanup is best-effort and never blocks the delete.
export async function removeMachine(machineId) {
  try {
    const manuals = await fetchManualsForMachine(machineId);
    for (const m of manuals) {
      const { data: pages } = await supabase.storage.from('manual-pages').list(String(m.id), { limit: 1000 });
      if (pages && pages.length) {
        await supabase.storage.from('manual-pages').remove(pages.map((f) => `${m.id}/${f.name}`));
      }
    }
    const { data: pdfs } = await supabase.storage.from('manuals').list(String(machineId), { limit: 1000 });
    if (pdfs && pdfs.length) {
      await supabase.storage.from('manuals').remove(pdfs.map((f) => `${machineId}/${f.name}`));
    }
  } catch {
    /* ignore storage cleanup errors — the DB delete below is what matters */
  }

  const { error } = await supabase.from('et_machines').delete().eq('id', machineId);
  if (error) throw error;
}

// ── Manual upload (employee-facing) ──
// Uploads the PDF straight to Storage, creates the manual row, and kicks off the
// background page processor. Returns the new manual id.
export async function uploadManual({ machineId, title, file, onProgress }) {
  const safe = file.name.replace(/[^\w.-]/g, '_');
  const storagePath = `${machineId}/${Date.now()}-${safe}`;

  const { error: upErr } = await supabase.storage
    .from('manuals')
    .upload(storagePath, file, { contentType: 'application/pdf', upsert: false });
  if (upErr) throw upErr;
  if (onProgress) onProgress('uploaded');

  const { data: manual, error: insErr } = await supabase
    .from('et_manuals')
    .insert({
      machine_id: machineId,
      title: title || file.name.replace(/\.pdf$/i, ''),
      storage_path: storagePath,
      status: 'pending',
      pages_done: 0,
    })
    .select('id')
    .single();
  if (insErr) throw insErr;

  // Fire the background processor (returns 202; it re-invokes itself per chunk).
  fetch('/.netlify/functions/manual-process-background', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ manualId: manual.id, startPage: 1 }),
  }).catch(() => {});

  return manual.id;
}

// Poll a manual's ingestion progress. Calls onUpdate({status, pageCount, pagesDone}).
export async function pollManual(manualId, onUpdate, { intervalMs = 2000 } = {}) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  while (true) {
    const { data, error } = await supabase
      .from('et_manuals')
      .select('status, page_count, pages_done, error')
      .eq('id', manualId)
      .single();
    if (error) throw error;
    onUpdate({
      status: data.status,
      pageCount: data.page_count || 0,
      pagesDone: data.pages_done || 0,
      error: data.error,
    });
    if (data.status === 'ready') return;
    if (data.status === 'error') throw new Error(data.error || 'Processing failed');
    await wait(intervalMs);
  }
}
