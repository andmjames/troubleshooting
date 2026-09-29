import React, { useEffect, useState, useCallback, useRef } from 'react';
import { fetchTodos, addTodo, setTodoDone, deleteTodo, reorderTodos, uploadRepairPhoto, signedUrl } from '../lib/supabase';
import { IconPlus } from '../lib/icons';
import { useToast } from './Toast';

const fmtWhen = (iso) => {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  catch { return ''; }
};
const ageDays = (iso) => {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
};
const ageClass = (d) => (d <= 5 ? 'todo-age-green' : d <= 10 ? 'todo-age-orange' : 'todo-age-red');
const ageLabel = (d) => `${d} day${d === 1 ? '' : 's'} old`;

function TaskThumb({ path, onOpen }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let alive = true;
    signedUrl('repair-photos', path).then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [path]);
  if (!url) return <div className="photo-tile photo-tile-loading" />;
  return (
    <button type="button" className="photo-tile" onClick={() => onOpen(url)} aria-label="View photo">
      <img src={url} alt="" />
    </button>
  );
}

function Lightbox({ src, onClose }) {
  if (!src) return null;
  return (
    <div className="lightbox" onClick={onClose}>
      <button className="lightbox-close" onClick={onClose} aria-label="Close">×</button>
      <img className="lightbox-img" src={src} alt="" onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

export default function ToDoList({ onBack, userName }) {
  const [openList, setOpenList] = useState([]);
  const [doneList, setDoneList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);   // task being viewed in detail
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState([]);          // {file, preview}
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [dragId, setDragId] = useState(null);
  const fileRef = useRef(null);
  const rowRefs = useRef({});
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await fetchTodos();
      const open = all.filter((t) => !t.done).sort((a, b) => {
        const pa = a.position == null ? Infinity : a.position;
        const pb = b.position == null ? Infinity : b.position;
        if (pa !== pb) return pa - pb;
        return new Date(b.created_at) - new Date(a.created_at);
      });
      const done = all.filter((t) => t.done).sort((a, b) =>
        new Date(b.completed_at || b.created_at) - new Date(a.completed_at || a.created_at));
      setOpenList(open);
      setDoneList(done);
      // keep the detail view in sync with fresh data
      setSelected((sel) => (sel ? all.find((t) => t.id === sel.id) || null : null));
    } catch (e) {
      toast(e.message || 'Could not load the to-do list', 'error');
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const addPhotos = (files) =>
    setPhotos((prev) => [...prev, ...files.map((f) => ({ file: f, preview: URL.createObjectURL(f) }))]);
  const removePhoto = (idx) => setPhotos((prev) => prev.filter((_, i) => i !== idx));
  const cancelAdd = () => { setTitle(''); setDescription(''); setPhotos([]); };

  const add = async () => {
    if (!title.trim()) { toast('Give the task a title', 'error'); return; }
    setAdding(true);
    try {
      const uploaded = [];
      for (const p of photos) {
        const path = await uploadRepairPhoto(p.file);
        uploaded.push({ path, caption: '' });
      }
      const minPos = openList.length ? Math.min(...openList.map((t) => (t.position == null ? 0 : t.position))) : 0;
      await addTodo({ title, description, photos: uploaded, createdBy: userName || null, position: minPos - 1 });
      setTitle(''); setDescription(''); setPhotos([]);
      await load();
    } catch (e) {
      toast(e.message || 'Could not add the task', 'error');
    } finally { setAdding(false); }
  };

  const markComplete = async (t, done) => {
    setBusy(true);
    try { await setTodoDone(t.id, done); await load(); setSelected(null); }
    catch (e) { toast(e.message || 'Could not update the task', 'error'); }
    finally { setBusy(false); }
  };
  const remove = async (t) => {
    setBusy(true);
    try { await deleteTodo(t.id); await load(); setSelected(null); }
    catch (e) { toast(e.message || 'Could not delete the task', 'error'); }
    finally { setBusy(false); }
  };

  // ── Drag-to-reorder (pointer events; works on touch + mouse) ──
  const onHandleDown = (e, id) => {
    e.preventDefault();
    setDragId(id);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  };
  const onHandleMove = (e) => {
    if (dragId == null) return;
    const y = e.clientY;
    let overId = null;
    for (const t of openList) {
      const el = rowRefs.current[t.id];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (y >= r.top && y <= r.bottom) { overId = t.id; break; }
    }
    if (overId == null || overId === dragId) return;
    setOpenList((prev) => {
      const arr = [...prev];
      const from = arr.findIndex((t) => t.id === dragId);
      const to = arr.findIndex((t) => t.id === overId);
      if (from < 0 || to < 0) return prev;
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      return arr;
    });
  };
  const onHandleUp = () => {
    if (dragId == null) return;
    setDragId(null);
    reorderTodos(openList.map((t) => t.id)).catch(() => {});
  };

  // ── Detail view ──
  if (selected) {
    const d = ageDays(selected.created_at);
    return (
      <div className="repair-wrap">
        <button className="back-link" onClick={() => setSelected(null)} style={{ marginBottom: 12 }}>← To Do List</button>
        <div className="section">
          <div className="section-body">
            <h2 className="todo-detail-title">{selected.text}</h2>
            <div className="todo-meta" style={{ marginTop: 4 }}>
              {selected.created_by && <span>added by {selected.created_by}</span>}
              {selected.created_at && <span>· {fmtWhen(selected.created_at)}</span>}
              {selected.done
                ? <span>· completed {fmtWhen(selected.completed_at)}</span>
                : <span className={ageClass(d)}>· {ageLabel(d)}</span>}
            </div>
            {selected.description && <p className="todo-detail-desc">{selected.description}</p>}
            {Array.isArray(selected.photos) && selected.photos.length > 0 && (
              <div className="photo-strip" style={{ marginTop: 12 }}>
                {selected.photos.map((p, i) => <TaskThumb key={i} path={p.path} onOpen={setLightbox} />)}
              </div>
            )}
          </div>
          <div className="modal-footer" style={{ borderTop: '.5px solid var(--border)' }}>
            <button className="btn btn-danger" onClick={() => remove(selected)} disabled={busy}>Delete Task</button>
            {selected.done
              ? <button className="btn" onClick={() => markComplete(selected, false)} disabled={busy}>Reopen</button>
              : <button className="btn btn-primary" onClick={() => markComplete(selected, true)} disabled={busy}>Mark as Complete</button>}
          </div>
        </div>
        <Lightbox src={lightbox} onClose={() => setLightbox(null)} />
      </div>
    );
  }

  // ── List view ──
  return (
    <div className="repair-wrap">
      <button className="back-link" onClick={onBack} style={{ marginBottom: 12 }}>← Home</button>

      <div className="section">
        <div className="section-header">
          <span className="section-title"><span className="section-title-dot" /> Add a task</span>
        </div>
        <div className="section-body">
          <div className="todo-add">
            <input className="field-input" placeholder="Task title" value={title} onChange={(e) => setTitle(e.target.value)} />
            {title.trim() && (
              <>
                <textarea
                  className="field-input todo-desc-input"
                  placeholder="Description (details, steps, anything useful)…"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
                <div className="photo-strip">
                  {photos.map((p, i) => (
                    <div key={i} className="photo-tile">
                      <img src={p.preview} alt="" />
                      <button type="button" className="photo-remove" onClick={() => removePhoto(i)} aria-label="Remove photo">×</button>
                    </div>
                  ))}
                  <button type="button" className="photo-add" onClick={() => fileRef.current?.click()} disabled={adding}>
                    <IconPlus /> Add photo
                  </button>
                </div>
                <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
                  onChange={(e) => { addPhotos(Array.from(e.target.files || [])); e.target.value = ''; }} />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button className="btn" onClick={cancelAdd} disabled={adding}>Cancel</button>
                  <button className="btn btn-primary" onClick={add} disabled={adding || !title.trim()}>
                    {adding ? 'Adding…' : 'Add task'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="loading-state" style={{ marginTop: 16 }}><span className="spinner" /> Loading…</div>
      ) : (
        <>
          <div className="section" style={{ marginTop: 16 }}>
            <div className="section-header">
              <span className="section-title"><span className="section-title-dot" /> Open ({openList.length})</span>
              {openList.length > 1 && <span className="todo-hint">drag to prioritize</span>}
            </div>
            <div className="section-body">
              {openList.length === 0 ? <div className="picker-empty">Nothing to do — nice.</div> : openList.map((t) => {
                const d = ageDays(t.created_at);
                return (
                  <div
                    key={t.id}
                    ref={(el) => { rowRefs.current[t.id] = el; }}
                    className={`todo-row${dragId === t.id ? ' todo-dragging' : ''}`}
                  >
                    <button
                      className="todo-grip"
                      aria-label="Drag to reorder"
                      onPointerDown={(e) => onHandleDown(e, t.id)}
                      onPointerMove={onHandleMove}
                      onPointerUp={onHandleUp}
                      onPointerCancel={onHandleUp}
                    >⋮⋮</button>
                    <button className="todo-open" onClick={() => setSelected(t)}>
                      <div className="todo-text">{t.text}</div>
                      <div className="todo-meta">
                        {t.created_by && <span>added by {t.created_by}</span>}
                        {t.created_at && <span>· {fmtWhen(t.created_at)}</span>}
                        <span className={ageClass(d)}>· {ageLabel(d)}</span>
                        {Array.isArray(t.photos) && t.photos.length > 0 && <span>· 📎 {t.photos.length}</span>}
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="section" style={{ marginTop: 16 }}>
            <div className="section-header">
              <span className="section-title"><span className="section-title-dot" /> Completed ({doneList.length})</span>
            </div>
            <div className="section-body">
              {doneList.length === 0 ? <div className="picker-empty">No completed tasks yet.</div> : doneList.map((t) => (
                <div key={t.id} className="todo-row todo-done">
                  <button className="todo-open" onClick={() => setSelected(t)}>
                    <div className="todo-text">{t.text}</div>
                    <div className="todo-meta">
                      {t.created_by && <span>added by {t.created_by}</span>}
                      {t.completed_at && <span>· completed {fmtWhen(t.completed_at)}</span>}
                      {Array.isArray(t.photos) && t.photos.length > 0 && <span>· 📎 {t.photos.length}</span>}
                    </div>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <Lightbox src={lightbox} onClose={() => setLightbox(null)} />
    </div>
  );
}
