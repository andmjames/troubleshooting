import React, { useEffect, useState, useCallback, useRef } from 'react';
import { fetchRepairLogs, updateRepairLog, removeRepairLog, signedUrl, uploadRepairPhoto } from '../lib/supabase';
import { IconPlus } from '../lib/icons';
import { useToast } from './Toast';

// Thumbnail that resolves a private storage path to a signed URL.
function AsyncThumb({ path, onOpen }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let alive = true;
    signedUrl('repair-photos', path).then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [path]);
  if (!url) return <div className="photo-tile" />;
  return <img className="msg-thumb" src={url} alt="" onClick={() => onOpen && onOpen(url)} />;
}

// Editable photo group: items are {kind:'existing', path} or {kind:'new', file, preview}.
function PhotoEditor({ photos, setPhotos }) {
  const inputRef = useRef(null);
  const add = (files) =>
    setPhotos((p) => [...p, ...files.map((f) => ({ kind: 'new', file: f, preview: URL.createObjectURL(f) }))]);
  const remove = (i) => setPhotos((p) => p.filter((_, idx) => idx !== i));
  return (
    <>
      <div className="photo-strip">
        {photos.map((p, i) => (
          <div key={i} className="photo-tile">
            {p.kind === 'new'
              ? <img src={p.preview} alt="" />
              : <ExistingTileImg path={p.path} />}
            <button type="button" className="photo-remove" onClick={() => remove(i)} aria-label="Remove photo">×</button>
          </div>
        ))}
        <button type="button" className="photo-add" onClick={() => inputRef.current?.click()}>
          <IconPlus /> Add photo
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => { add(Array.from(e.target.files || [])); e.target.value = ''; }}
      />
    </>
  );
}

function ExistingTileImg({ path }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let alive = true;
    signedUrl('repair-photos', path).then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [path]);
  return url ? <img src={url} alt="" /> : null;
}

const fmtDate = (iso) => {
  try { return new Date(iso).toLocaleDateString(); } catch { return ''; }
};

export default function RepairLogManager({ machine, onBack }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);     // log id being edited, or null
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const toast = useToast();

  // Edit form state
  const [problem, setProblem] = useState('');
  const [solution, setSolution] = useState('');
  const [details, setDetails] = useState('');
  const [technician, setTechnician] = useState('');
  const [probPhotos, setProbPhotos] = useState([]);
  const [solPhotos, setSolPhotos] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setLogs(await fetchRepairLogs(machine.id));
    } catch (e) {
      toast(e.message || 'Could not load repair logs', 'error');
    } finally {
      setLoading(false);
    }
  }, [machine.id, toast]);

  useEffect(() => { load(); }, [load]);

  const startEdit = (log) => {
    setProblem(log.problem || '');
    setSolution(log.solution || '');
    setDetails(log.details || '');
    setTechnician(log.technician || '');
    setProbPhotos((log.problem_photos || []).map((p) => ({ kind: 'existing', path: p.path })));
    setSolPhotos((log.solution_photos || []).map((p) => ({ kind: 'existing', path: p.path })));
    setEditing(log.id);
  };
  const cancelEdit = () => setEditing(null);

  const uploadGroup = async (items) => {
    const out = [];
    for (const it of items) {
      if (it.kind === 'existing') out.push({ path: it.path, caption: '' });
      else { const path = await uploadRepairPhoto(it.file); out.push({ path, caption: '' }); }
    }
    return out;
  };

  const saveEdit = async () => {
    if (!problem.trim()) { toast('Problem description is required', 'error'); return; }
    setSaving(true);
    try {
      const [pPhotos, sPhotos] = await Promise.all([uploadGroup(probPhotos), uploadGroup(solPhotos)]);
      await updateRepairLog(editing, {
        problem, solution, details, technician,
        problem_photos: pPhotos, solution_photos: sPhotos,
      });
      toast('Repair log updated', 'success');
      setEditing(null);
      await load();
    } catch (e) {
      toast(e.message || 'Could not save changes', 'error');
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!confirmDel) return;
    setRemoving(true);
    try {
      await removeRepairLog(confirmDel);
      toast('Repair log deleted', 'success');
      setConfirmDel(null);
      await load();
    } catch (e) {
      toast(e.message || 'Could not delete', 'error');
    } finally {
      setRemoving(false);
    }
  };

  // ── Edit form ──
  if (editing !== null) {
    return (
      <div className="repair-wrap">
        <button className="back-link" onClick={cancelEdit} style={{ marginBottom: 12 }}>← Back to log entries</button>

        <div className="section">
          <div className="section-header">
            <span className="section-title"><span className="section-title-dot" /> Edit repair log</span>
          </div>
          <div className="section-body">
            <div className="field-group">
              <label className="field-label">Problem *</label>
              <textarea className="repair-textarea" value={problem} onChange={(e) => setProblem(e.target.value)} />
            </div>
            <label className="field-label" style={{ marginTop: 14, display: 'block' }}>Problem photos</label>
            <PhotoEditor photos={probPhotos} setPhotos={setProbPhotos} />

            <div className="field-group" style={{ marginTop: 18 }}>
              <label className="field-label">Solution</label>
              <textarea className="repair-textarea" value={solution} onChange={(e) => setSolution(e.target.value)} />
            </div>
            <label className="field-label" style={{ marginTop: 14, display: 'block' }}>Solution photos</label>
            <PhotoEditor photos={solPhotos} setPhotos={setSolPhotos} />

            <div className="field-group" style={{ marginTop: 18 }}>
              <label className="field-label">Extra details</label>
              <textarea className="repair-textarea" value={details} onChange={(e) => setDetails(e.target.value)} />
            </div>
            <div className="field-group" style={{ marginTop: 12 }}>
              <label className="field-label">Technician</label>
              <input className="field-input" value={technician} onChange={(e) => setTechnician(e.target.value)} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={cancelEdit} disabled={saving}>Cancel</button>
              <button className="btn btn-primary" onClick={saveEdit} disabled={saving || !problem.trim()}>
                {saving ? <><span className="spinner" /> Saving…</> : 'Save changes'}
              </button>
            </div>
          </div>
        </div>

        {lightbox && <div className="lightbox" onClick={() => setLightbox(null)}><img src={lightbox} alt="" /></div>}
      </div>
    );
  }

  // ── List view ──
  return (
    <div className="repair-wrap">
      <button className="back-link" onClick={onBack} style={{ marginBottom: 12 }}>← Edit Machines</button>

      <div className="repair-context-bar">
        Repair log for <span className="repair-context-machine">{machine.name}</span>
      </div>

      <div className="section">
        <div className="section-header">
          <span className="section-title">
            <span className="section-title-dot" /> Entries{logs.length ? ` (${logs.length})` : ''}
          </span>
        </div>
        <div className="section-body">
          {loading ? (
            <div className="loading-state"><span className="spinner" /> Loading…</div>
          ) : logs.length === 0 ? (
            <div className="picker-empty">No repair logs for this machine yet.</div>
          ) : (
            <div className="log-list">
              {logs.map((log) => {
                const pPhotos = log.problem_photos || [];
                const sPhotos = log.solution_photos || [];
                return (
                  <div key={log.id} className="log-entry">
                    <div className="log-entry-head">
                      <span className="log-entry-date">
                        {fmtDate(log.created_at)}{log.technician ? ` · ${log.technician}` : ''}
                      </span>
                      <div className="log-entry-actions">
                        <button className="btn btn-sm" onClick={() => startEdit(log)}>Edit</button>
                        <button className="btn btn-sm btn-danger" onClick={() => setConfirmDel(log)}>Delete</button>
                      </div>
                    </div>

                    <div className="log-field-label">Problem</div>
                    <div className="log-field-text">{log.problem}</div>
                    {pPhotos.length > 0 && (
                      <div className="msg-images">
                        {pPhotos.map((p, i) => <AsyncThumb key={i} path={p.path} onOpen={setLightbox} />)}
                      </div>
                    )}

                    {log.solution && <>
                      <div className="log-field-label">Solution</div>
                      <div className="log-field-text">{log.solution}</div>
                    </>}
                    {sPhotos.length > 0 && (
                      <div className="msg-images">
                        {sPhotos.map((p, i) => <AsyncThumb key={i} path={p.path} onOpen={setLightbox} />)}
                      </div>
                    )}

                    {log.details && <>
                      <div className="log-field-label">Details</div>
                      <div className="log-field-text">{log.details}</div>
                    </>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {confirmDel && (
        <div className="modal-overlay" onClick={() => !removing && setConfirmDel(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Delete this repair log?</span>
              <button className="modal-close" onClick={() => !removing && setConfirmDel(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14, lineHeight: 1.6 }}>
                This permanently deletes the entry from {fmtDate(confirmDel.created_at)} and its photos. This can't be undone.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setConfirmDel(null)} disabled={removing}>Cancel</button>
              <button className="btn btn-danger" onClick={doDelete} disabled={removing}>
                {removing ? <><span className="spinner" /> Deleting…</> : 'Delete entry'}
              </button>
            </div>
          </div>
        </div>
      )}

      {lightbox && <div className="lightbox" onClick={() => setLightbox(null)}><img src={lightbox} alt="" /></div>}
    </div>
  );
}
