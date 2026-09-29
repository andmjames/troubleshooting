import React, { useEffect, useState, useCallback } from 'react';
import { fetchTodos, addTodo, setTodoDone, deleteTodo, fetchUsers } from '../lib/supabase';
import { useToast } from './Toast';

const fmtWhen = (iso) => {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  catch { return ''; }
};

export default function ToDoList({ onBack, userName }) {
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assignees, setAssignees] = useState([]);   // admin + maintenance user names
  const [text, setText] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try { setTodos(await fetchTodos()); }
    catch (e) { toast(e.message || 'Could not load the to-do list', 'error'); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetchUsers()
      .then((us) => setAssignees(us.filter((u) => u.role === 'admin' || u.maintenance).map((u) => u.name)))
      .catch(() => {});
  }, []);

  const add = async () => {
    if (!text.trim()) { toast('Enter a task', 'error'); return; }
    setAdding(true);
    try {
      await addTodo({ text, assignedTo: assignedTo || null, createdBy: userName || null });
      setText(''); setAssignedTo('');
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
        <div className="todo-meta">
          {t.assigned_to && <span className="todo-chip">{t.assigned_to}</span>}
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
          <span className="section-title"><span className="section-title-dot" /> To Do List</span>
        </div>
        <div className="section-body">
          <div className="todo-add">
            <input
              className="field-input"
              placeholder="Add a task…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
            />
            <select className="field-input todo-assign" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
              <option value="">Unassigned</option>
              {assignees.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <button className="btn btn-primary" onClick={add} disabled={adding || !text.trim()}>
              {adding ? 'Adding…' : 'Add'}
            </button>
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
    </div>
  );
}
