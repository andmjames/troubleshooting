import React, { useEffect, useState, useCallback, useRef } from 'react';
import { fetchTodos, addTodo, setTodoDone, deleteTodo, uploadRepairPhoto, signedUrl } from '../lib/supabase';
import { IconPlus } from '../lib/icons';
import { useToast } from './Toast';

const fmtWhen = (iso) => {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  catch { return ''; }
};

// Thumbnail for a stored task photo (signs the URL on demand).
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
      <img src={src} alt="" onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

export default function ToDoList({ onBack, userName }) {
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState([]);        // {file, preview}
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const fileRef = useRef(null);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try { setTodos(await fetchTodos()); }
    catch (e) { toast(e.message || 'Could not load the to-do list', 'error'); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const addPhotos = (files) =>
    setPhotos((prev) => [...prev, ...files.map((f) => ({ file: f, preview: URL.createObjectURL(f) }))]);
  const removePhoto = (idx) => setPhotos((prev) => prev.filter((_, i) => i !== idx));

  const add = async () => {
    if (!title.trim()) { toast('Give the task a title', 'error'); return; }
    setAdding(true);
    try {
      const uploaded = [];
      for (const p of photos) {
        const path = await uploadRepairPhoto(p.file);
        uploaded.push({ path, caption: '' });
      }
      await addTodo({ title, description, photos: uploaded, createdBy: userName || null });
      setTitle(''); setDescription(''); setPhotos([]);
      await load();
    } catch (e) {
      toast(e.message || 'Could not add the task', 'error');
    } finally { setAdding(false); }
  };

  const toggle = async (t) => {
    setBusyId(t.id);
    try { await setTodoDone(t.id, !t.done); await load(); }
    catch (e) { toast(e.message || 'Could not update the task', 'error'); }
    finally { setBusyId(null); }
  };

  const remove = async (t) => {
    setBusyId(t.id);
    try { await deleteTodo(t.id); await load(); }
    catch (e) { toast(e.message || 'Could not delete the task', 'error'); }
    finally { setBusyId(null); }
  };

  const open = todos.filter((t) => !t.done);
  const done = todos.filter((t) => t.done);

  const renderTodo = (t) => (
    <div key={t.id} className={`todo-row${t.done ? ' todo-done' : ''}`}>
      <button className="todo-check" onClick={() => toggle(t)} disabled={busyId === t.id} aria-label={t.done ? 'Mark not done' : 'Mark done'}>
        {t.done ? '✓' : ''}
      </button>
      <div className="todo-main">
        <div className="todo-text">{t.text}</div>
        {t.description && <div className="todo-desc">{t.description}</div>}
        {Array.isArray(t.photos) && t.photos.length > 0 && (
          <div className="photo-strip todo-photos">
            {t.photos.map((p, i) => <TaskThumb key={i} path={p.path} onOpen={setLightbox} />)}
          </div>
        )}
        <div className="todo-meta">
          {t.created_by && <span>added by {t.created_by}</span>}
          {t.created_at && <span>· {fmtWhen(t.created_at)}</span>}
        </div>
      </div>
      <button className="todo-del" onClick={() => remove(t)} disabled={busyId === t.id} aria-label="Delete task">×</button>
    </div>
  );

  return (
    <div className="repair-wrap">
      <button className="back-link" onClick={onBack} style={{ marginBottom: 12 }}>← Home</button>

      <div className="section">
        <div className="section-header">
          <span className="section-title"><span className="section-title-dot" /> Add a task</span>
        </div>
        <div className="section-body">
          <div className="todo-add">
            <input
              className="field-input"
              placeholder="Task title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
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
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => { addPhotos(Array.from(e.target.files || [])); e.target.value = ''; }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={add} disabled={adding || !title.trim()}>
                {adding ? 'Adding…' : 'Add task'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="loading-state" style={{ marginTop: 16 }}><span className="spinner" /> Loading…</div>
      ) : (
        <>
          <div className="section" style={{ marginTop: 16 }}>
            <div className="section-header">
              <span className="section-title"><span className="section-title-dot" /> Open ({open.length})</span>
            </div>
            <div className="section-body">
              {open.length === 0 ? <div className="picker-empty">Nothing to do — nice.</div> : open.map(renderTodo)}
            </div>
          </div>

          {done.length > 0 && (
            <div className="section" style={{ marginTop: 16 }}>
              <div className="section-header">
                <span className="section-title"><span className="section-title-dot" /> Completed ({done.length})</span>
              </div>
              <div className="section-body">{done.map(renderTodo)}</div>
            </div>
          )}
        </>
      )}

      <Lightbox src={lightbox} onClose={() => setLightbox(null)} />
    </div>
  );
}
