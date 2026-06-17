import React, { useEffect, useState, useCallback } from 'react';
import { fetchPMTasks, addPMTask, updatePMTask, removePMTask } from '../lib/supabase';
import { INTERVALS, intervalLabel, taskTitle, taskUrl } from '../lib/pm';
import { useToast } from './Toast';

const BLANK = { name: '', bullets: '', interval_days: 90 };

// Convert checklist array <-> textarea text (one bullet per line)
const toText = (arr) => (Array.isArray(arr) ? arr.join('\n') : '');
const toList = (txt) => (txt || '').split('\n').map((s) => s.replace(/^[-*•]\s*/, '').trim()).filter(Boolean);

export default function PMEditor({ machine, onBack }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);     // task id, 'new', or null
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTasks(await fetchPMTasks(machine.id));
    } catch (e) {
      toast(e.message || 'Could not load tasks', 'error');
    } finally {
      setLoading(false);
    }
  }, [machine.id, toast]);

  useEffect(() => { load(); }, [load]);

  const startNew = () => { setForm(BLANK); setEditing('new'); };
  const startEdit = (t) => {
    setForm({ name: t.name || '', bullets: toText(t.checklist), interval_days: t.interval_days });
    setEditing(t.id);
  };
  const cancel = () => { setEditing(null); setForm(BLANK); };

  const save = async () => {
    const checklist = toList(form.bullets);
    if (checklist.length === 0) {
      toast('Add at least one checklist item', 'error');
      return;
    }
    setSaving(true);
    try {
      if (editing === 'new') {
        await addPMTask({ machine_id: machine.id, name: form.name.trim(), checklist, interval_days: form.interval_days });
        toast('Task added', 'success');
      } else {
        await updatePMTask(editing, { name: form.name.trim(), checklist, interval_days: form.interval_days });
        toast('Task updated', 'success');
      }
      cancel();
      await load();
    } catch (e) {
      toast(e.message || 'Could not save task', 'error');
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!confirmDel) return;
    try {
      await removePMTask(confirmDel.id);
      toast('Task deleted', 'success');
      setConfirmDel(null);
      await load();
    } catch (e) {
      toast(e.message || 'Could not delete', 'error');
    }
  };

  const copyLink = async (t) => {
    try {
      await navigator.clipboard.writeText(taskUrl(t.id));
      toast('Link copied — send it to whoever should complete this', 'success');
    } catch {
      toast('Could not copy the link', 'error');
    }
  };

  return (
    <div className="repair-wrap">
      <button className="back-link" onClick={onBack} style={{ marginBottom: 12 }}>← Edit Machines</button>

      <div className="repair-context-bar">
        Preventative maintenance for <span className="repair-context-machine">{machine.name}</span>
      </div>

      {/* Task editor form */}
      {editing !== null ? (
        <div className="section">
          <div className="section-header">
            <span className="section-title">
              <span className="section-title-dot" /> {editing === 'new' ? 'New task' : 'Edit task'}
            </span>
          </div>
          <div className="section-body">
            <div className="field-group">
              <label className="field-label">Task name</label>
              <input
                className="field-input"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Monthly lubrication"
              />
            </div>
            <div className="field-group" style={{ marginTop: 12 }}>
              <label className="field-label">Checklist — one item per line</label>
              <textarea
                className="repair-textarea"
                style={{ minHeight: 140 }}
                value={form.bullets}
                onChange={(e) => setForm((f) => ({ ...f, bullets: e.target.value }))}
                placeholder={'Grease all bearings\nCheck belt tension\nInspect for leaks'}
              />
            </div>
            <div className="field-group" style={{ marginTop: 12 }}>
              <label className="field-label">Interval — how often this must be completed</label>
              <select
                className="field-input"
                value={form.interval_days}
                onChange={(e) => setForm((f) => ({ ...f, interval_days: parseInt(e.target.value, 10) }))}
              >
                {INTERVALS.map((i) => <option key={i.days} value={i.days}>{i.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={cancel} disabled={saving}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? <><span className="spinner" /> Saving…</> : 'Save task'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="edit-actions-bar">
            <span className="edit-actions-label">Tasks{tasks.length ? ` (${tasks.length})` : ''}</span>
            <button className="btn btn-sm btn-primary" onClick={startNew}>Add task</button>
          </div>

          <div className="section">
            <div className="section-body" style={{ paddingTop: '0.5rem', paddingBottom: '0.5rem' }}>
              {loading ? (
                <div className="loading-state"><span className="spinner" /> Loading…</div>
              ) : tasks.length === 0 ? (
                <div className="picker-empty">No tasks yet — add one above.</div>
              ) : (
                <div className="machine-edit-list">
                  {tasks.map((t) => {
                    const items = Array.isArray(t.checklist) ? t.checklist : [];
                    return (
                      <div key={t.id} className="machine-edit-row">
                        <div className="machine-edit-info">
                          <div className="machine-edit-name">{t.name?.trim() || intervalLabel(t.interval_days)}</div>
                          <div className="machine-edit-meta">
                            {intervalLabel(t.interval_days)} · {items.length} item{items.length === 1 ? '' : 's'}
                          </div>
                        </div>
                        <div className="machine-edit-actions">
                          <button className="btn btn-sm" onClick={() => copyLink(t)}>Copy link</button>
                          <button className="btn btn-sm" onClick={() => startEdit(t)}>Edit</button>
                          <button className="btn btn-sm btn-danger" onClick={() => setConfirmDel(t)}>Delete</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {confirmDel && (
        <div className="modal-overlay" onClick={() => setConfirmDel(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Delete this task?</span>
              <button className="modal-close" onClick={() => setConfirmDel(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14, lineHeight: 1.6 }}>
                This removes the "{taskTitle(confirmDel)}" task and its completion history. This can't be undone.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setConfirmDel(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={doDelete}>Delete task</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
