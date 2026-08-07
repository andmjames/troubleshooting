import { createClient } from '@supabase/supabase-js';

const url = process.env.REACT_APP_SUPABASE_URL;
const anonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

export const supabase = createClient(url, anonKey);

// ── Users (managed in Settings) ──
export async function fetchUsers() {
  const { data, error } = await supabase
    .from('et_users')
    .select('id, name, slug, role, permissions, machine_ids, maintenance, created_at')
    .order('name', { ascending: true });
  if (error) throw error;
  return data || [];
}
export async function addUser(name) {
  const { data, error } = await supabase
    .from('et_users')
    .insert({ name: (name || '').trim() })
    .select()
    .single();
  if (error) throw error;
  return data;
}
export async function updateUser(id, fields) {
  const payload = {};
  if ('role' in fields) payload.role = fields.role;
  if ('permissions' in fields) payload.permissions = fields.permissions || {};
  if ('machine_ids' in fields) payload.machine_ids = fields.machine_ids || [];
  if ('maintenance' in fields) payload.maintenance = !!fields.maintenance;
  const { data, error } = await supabase
    .from('et_users')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
export async function removeUser(id) {
  const { error } = await supabase.from('et_users').delete().eq('id', id);
  if (error) throw error;
}

// Machines list for the picker (shared by both flows)
export async function fetchMachines() {
  const { data, error } = await supabase
    .from('et_machines')
    .select('id, name, manufacturer, model_number, manufacturer_phone, manufacturer_email, serial_number')
    .order('name', { ascending: true });
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

// Upload a troubleshooting-chat photo (compressed blob) to the repair-photos bucket.
export async function uploadTroubleshootPhoto(blob, machineId) {
  const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `troubleshoot/${machineId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from('repair-photos')
    .upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false });
  if (error) throw error;
  return path;
}

// Best-effort delete of an uploaded chat photo (e.g. user removed it before sending).
export async function removeTroubleshootPhoto(path) {
  if (!path) return;
  try { await supabase.storage.from('repair-photos').remove([path]); } catch { /* ignore */ }
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

// Save a solution as ONE repair tied to one or more machines. The first machine
// is the primary (machine_id); when there's more than one, machine_ids holds the
// full id list and group_machines the names — so it counts as a single repair.
export async function saveRepairLogMulti({ machines, ...fields }) {
  const list = (machines || []).filter((m) => m && m.id != null);
  if (!list.length) throw new Error('Pick at least one machine');
  const multi = list.length > 1;
  const row = {
    ...fields,
    machine_id: Number(list[0].id),
    machine_ids: multi ? list.map((m) => Number(m.id)) : null,
    group_machines: multi ? list.map((m) => m.name) : null,
  };
  const { data, error } = await supabase.from('et_repair_logs').insert(row).select().single();
  if (error) throw error;
  return data;
}

// List a machine's repair logs, newest first.
export async function fetchRepairLogs(machineId) {
  // Include repairs where this machine is the primary OR one of the tied machines.
  const { data, error } = await supabase
    .from('et_repair_logs')
    .select('id, machine_id, machine_ids, problem, solution, details, technician, required_andrew_input, problem_photos, solution_photos, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  const mid = Number(machineId);
  return (data || []).filter((r) =>
    Number(r.machine_id) === mid ||
    (Array.isArray(r.machine_ids) && r.machine_ids.map(Number).includes(mid))
  );
}

// All repair logs across every machine, newest first, each tagged with its machine name.
export async function fetchAllRepairLogs() {
  const [logsRes, machines] = await Promise.all([
    supabase
      .from('et_repair_logs')
      .select('id, machine_id, machine_ids, problem, solution, details, technician, required_andrew_input, problem_photos, solution_photos, created_at')
      .order('created_at', { ascending: false }),
    fetchMachines(),
  ]);
  if (logsRes.error) throw logsRes.error;
  const nameById = {};
  (machines || []).forEach((m) => { nameById[m.id] = m.name; });
  return (logsRes.data || []).map((r) => {
    const ids = Array.isArray(r.machine_ids) && r.machine_ids.length ? r.machine_ids : [r.machine_id];
    return {
      ...r,
      machine_name: nameById[r.machine_id] || 'Unknown machine',
      machine_names: ids.map((id) => nameById[id] || 'Unknown machine'),
    };
  });
}

// Edit a repair log entry.
export async function updateRepairLog(id, fields) {
  const payload = {};
  if ('problem' in fields) {
    const p = (fields.problem || '').trim();
    if (!p) throw new Error('Problem description is required');
    payload.problem = p;
  }
  if ('solution' in fields) payload.solution = (fields.solution || '').trim() || null;
  if ('details' in fields) payload.details = (fields.details || '').trim() || null;
  if ('technician' in fields) payload.technician = (fields.technician || '').trim() || null;
  if ('required_andrew_input' in fields) payload.required_andrew_input = fields.required_andrew_input;
  if ('problem_photos' in fields) payload.problem_photos = fields.problem_photos || [];
  if ('solution_photos' in fields) payload.solution_photos = fields.solution_photos || [];
  const { data, error } = await supabase
    .from('et_repair_logs').update(payload).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

// Delete a repair log entry (best-effort photo cleanup).
export async function removeRepairLog(log) {
  try {
    const paths = [...(log.problem_photos || []), ...(log.solution_photos || [])]
      .map((p) => p && p.path).filter(Boolean);
    if (paths.length) await supabase.storage.from('repair-photos').remove(paths);
  } catch {
    /* ignore storage cleanup errors */
  }
  const { error } = await supabase.from('et_repair_logs').delete().eq('id', log.id);
  if (error) throw error;
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

// Ask the server to check its own environment (env vars + service-role Supabase
// access). Returns a short human-readable diagnosis for the chat.
export async function selfTestTroubleshoot() {
  try {
    const res = await fetch('/.netlify/functions/troubleshoot-selftest', { method: 'POST' });
    const j = await res.json();
    if (j.ok) {
      return "the server environment is healthy (Supabase + keys OK), so the background worker itself isn't being invoked — likely a Netlify background-function or deploy issue.";
    }
    const parts = [];
    const env = j.checks && j.checks.env;
    if (env) {
      const missing = Object.keys(env).filter((k) => !env[k]);
      if (missing.length) parts.push(`missing server config: ${missing.join(', ')}`);
    }
    if (j.checks && j.checks.supabase && j.checks.supabase !== 'ok') {
      parts.push(`Supabase check ${j.checks.supabase}`);
    }
    return parts.length ? parts.join('; ') + '.' : 'the server self-test failed.';
  } catch (e) {
    return `the server self-test could not be reached (${String(e.message || e)}).`;
  }
}

// Poll a job until it's done or errors. Resolves with the result object.
export async function pollTroubleshootJob(jobId, { intervalMs = 1500, timeoutMs = 120000, stallMs = 18000 } = {}) {
  const start = Date.now();
  let sawRunning = false;
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
    if (data.status === 'running') sawRunning = true;

    const elapsed = Date.now() - start;
    // If the worker never even started (still 'pending' well past when it should
    // have claimed the job), stop waiting and report WHY via the self-test.
    if (!sawRunning && elapsed > stallMs) {
      const diag = await selfTestTroubleshoot();
      throw new Error(`The troubleshooting worker didn't start — ${diag}`);
    }
    if (elapsed > timeoutMs) {
      if (!sawRunning) {
        const diag = await selfTestTroubleshoot();
        throw new Error(`The troubleshooting worker didn't start — ${diag}`);
      }
      throw new Error('The worker started but did not finish in time. Please try again.');
    }
    await wait(intervalMs);
  }
}

// List the manuals already attached to a machine (newest first).
export async function fetchManualsForMachine(machineId) {
  const { data, error } = await supabase
    .from('et_manuals')
    .select('id, title, status, page_count, pages_done, storage_path, created_at')
    .eq('machine_id', machineId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// Delete a manual: its row (cascades pages) plus best-effort storage cleanup.
export async function removeManual(manual) {
  try {
    if (manual.storage_path) await supabase.storage.from('manuals').remove([manual.storage_path]);
    const { data: pages } = await supabase.storage.from('manual-pages').list(String(manual.id), { limit: 1000 });
    if (pages && pages.length) {
      await supabase.storage.from('manual-pages').remove(pages.map((f) => `${manual.id}/${f.name}`));
    }
  } catch {
    /* ignore storage cleanup errors */
  }
  const { error } = await supabase.from('et_manuals').delete().eq('id', manual.id);
  if (error) throw error;
}

// Open a manual's PDF in a new tab via a short-lived signed URL.
export async function viewManual(manual) {
  const url = await signedUrl('manuals', manual.storage_path, 3600);
  if (url) window.open(url, '_blank', 'noopener');
  return url;
}

// Re-run page processing on a manual (e.g. if it got stuck or failed).
// Clears any existing pages first to avoid duplicates, then re-fires the worker.
export async function reprocessManual(manualId) {
  await supabase.from('et_manual_pages').delete().eq('manual_id', manualId);
  await supabase.from('et_manuals')
    .update({ status: 'pending', pages_done: 0, page_count: null, error: null })
    .eq('id', manualId);
  fetch('/.netlify/functions/manual-process-background', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ manualId, startPage: 1 }),
  }).catch(() => {});
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
export async function addMachine({ name, manufacturer, model_number, manufacturer_phone, manufacturer_email, serial_number }) {
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

  const clean = (v) => (v || '').trim() || null;
  const { data, error } = await supabase
    .from('et_machines')
    .insert({
      name: trimmed,
      manufacturer: clean(manufacturer),
      model_number: clean(model_number),
      manufacturer_phone: clean(manufacturer_phone),
      manufacturer_email: clean(manufacturer_email),
      serial_number: clean(serial_number),
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

// Update an existing machine's editable fields.
export async function updateMachine(id, fields) {
  const clean = (v) => (v || '').trim() || null;
  const allowed = ['name', 'manufacturer', 'model_number', 'manufacturer_phone', 'manufacturer_email', 'serial_number'];
  const payload = {};
  for (const k of allowed) {
    if (k in fields) payload[k] = k === 'name' ? (fields[k] || '').trim() : clean(fields[k]);
  }
  if ('name' in payload && !payload.name) throw new Error('Machine name is required');

  const { data, error } = await supabase
    .from('et_machines')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) {
    if (error.code === '23505') throw new Error('A machine with that name already exists');
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

// ── Preventative maintenance ──
export async function fetchPMTasks(machineId) {
  const { data, error } = await supabase
    .from('et_pm_tasks')
    .select('id, machine_id, name, checklist, interval_days, interval_count, interval_unit, last_completed')
    .eq('machine_id', machineId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function fetchAllPMTasks() {
  const { data, error } = await supabase
    .from('et_pm_tasks')
    .select('id, machine_id, name, checklist, interval_days, interval_count, interval_unit, last_completed');
  if (error) throw error;
  return data || [];
}

export async function addPMTask({ machine_id, name, checklist, interval_days, interval_count, interval_unit }) {
  const { data, error } = await supabase
    .from('et_pm_tasks')
    .insert({
      machine_id,
      name: name || null,
      checklist: checklist || [],
      interval_days,
      interval_count: interval_count ?? null,
      interval_unit: interval_unit ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updatePMTask(id, fields) {
  const payload = {};
  if ('name' in fields) payload.name = fields.name || null;
  if ('checklist' in fields) payload.checklist = fields.checklist || [];
  if ('interval_days' in fields) payload.interval_days = fields.interval_days;
  if ('interval_count' in fields) payload.interval_count = fields.interval_count ?? null;
  if ('interval_unit' in fields) payload.interval_unit = fields.interval_unit ?? null;
  const { data, error } = await supabase
    .from('et_pm_tasks').update(payload).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function removePMTask(id) {
  const { error } = await supabase.from('et_pm_tasks').delete().eq('id', id);
  if (error) throw error;
}

// Record a completion: log it and reset the task's last_completed (the counter).
export async function completePMTask({ task_id, machine_id, performed_by, performed_on }) {
  const { error: cErr } = await supabase.from('et_pm_completions').insert({
    task_id, machine_id,
    performed_by: (performed_by || '').trim() || null,
    performed_on,
  });
  if (cErr) throw cErr;
  const { error: uErr } = await supabase
    .from('et_pm_tasks').update({ last_completed: performed_on }).eq('id', task_id);
  if (uErr) throw uErr;
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
