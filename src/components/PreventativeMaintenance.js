import React, { useEffect, useState, useCallback, useRef } from 'react';
import { fetchMachines, fetchAllPMTasks, completePMTask } from '../lib/supabase';
import { daysUntilDue, bucketOf, tally, dueText, intervalLabel, todayISO, taskUrl } from '../lib/pm';
import { useToast } from './Toast';

function Counts({ counts, size }) {
  return (
    <div className={`pm-counts ${size === 'lg' ? 'pm-counts-lg' : ''}`}>
      <span className="pm-count pm-count-green"><b>{counts.green}</b><span>30+ days</span></span>
      <span className="pm-count pm-count-yellow"><b>{counts.yellow}</b><span>1–30 days</span></span>
      <span className="pm-count pm-count-red"><b>{counts.red}</b><span>Overdue</span></span>
    </div>
  );
}

export default function PreventativeMaintenance({ onBack, initialTaskId }) {
  const [machines, setMachines] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selMachine, setSelMachine] = useState(null);
  const [selTask, setSelTask] = useState(null);
  const [checked, setChecked] = useState({});       // checklist item index -> bool
  const [completing, setCompleting] = useState(false);
  const [doneBy, setDoneBy] = useState('');
  const [doneOn, setDoneOn] = useState(todayISO());
  const [saving, setSaving] = useState(false);
  const appliedDeepLink = useRef(false);
  const toast = useToast();

  // Keep the address bar in sync so the task page has a shareable URL.
  const setUrlForTask = (taskId) => {
    try {
      const url = taskId ? `?pmtask=${taskId}` : window.location.pathname;
      window.history.replaceState(null, '', url);
    } catch { /* ignore */ }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, t] = await Promise.all([fetchMachines(), fetchAllPMTasks()]);
      setMachines(m);
      setTasks(t);
    } catch (e) {
      toast(e.message || 'Could not load maintenance data', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // Open a shared task once data is loaded. Inlined (no external fn refs) so the
  // effect's dependency list is complete and needs no eslint override.
  useEffect(() => {
    if (appliedDeepLink.current || !initialTaskId || loading) return;
    appliedDeepLink.current = true;
    const t = tasks.find((x) => String(x.id) === String(initialTaskId));
    if (t) {
      setSelMachine(machines.find((m) => m.id === t.machine_id) || { id: t.machine_id, name: 'Machine' });
      setSelTask(t);
      setChecked({});
      setDoneBy('');
      setDoneOn(todayISO());
      setCompleting(false);
      try { window.history.replaceState(null, '', `?pmtask=${t.id}`); } catch { /* ignore */ }
    }
  }, [initialTaskId, loading, tasks, machines]);

  const tasksFor = (machineId) => tasks.filter((t) => t.machine_id === machineId);

  const openTask = (task) => {
    setSelTask(task);
    setChecked({});
    setDoneBy('');
    setDoneOn(todayISO());
    setCompleting(false);
    setUrlForTask(task.id);
  };

  const closeTask = () => { setSelTask(null); setUrlForTask(null); };

  const copyLink = async () => {
    if (!selTask) return;
    try {
      await navigator.clipboard.writeText(taskUrl(selTask.id));
      toast('Link copied — send it to whoever should complete this', 'success');
    } catch {
      toast('Could not copy automatically. The link is in your address bar.', 'error');
    }
  };

  const submitCompletion = async () => {
    if (!selTask) return;
    setSaving(true);
    try {
      await completePMTask({
        task_id: selTask.id,
        machine_id: selTask.machine_id,
        performed_by: doneBy,
        performed_on: doneOn,
      });
      toast('Maintenance logged', 'success');
      await load();
      setSelTask(null);
      setUrlForTask(null);
      setCompleting(false);
    } catch (e) {
      toast(e.message || 'Could not log completion', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="repair-wrap">
        <button className="back-link" onClick={onBack} style={{ marginBottom: 12 }}>← Home</button>
        <div className="loading-state"><span className="spinner" /> Loading maintenance…</div>
      </div>
    );
  }

  // ── Task checklist view ──
  if (selTask) {
    const items = Array.isArray(selTask.checklist) ? selTask.checklist : [];
    const doneCount = Object.values(checked).filter(Boolean).length;
    return (
      <div className="repair-wrap">
        <button className="back-link" onClick={closeTask} style={{ marginBottom: 12 }}>
          ← {selMachine?.name || 'Tasks'}
        </button>

        <div className="section">
          <div className="section-header">
            <span className="section-title"><span className="section-title-dot" /> {intervalLabel(selTask.interval_days)} checklist</span>
            <button className="btn btn-ghost btn-sm" onClick={copyLink}>Copy link</button>
          </div>
          <div className="section-body">
            <div className="pm-task-sub">
              {dueText(daysUntilDue(selTask))}
            </div>
            {items.length === 0 ? (
              <div className="picker-empty">No checklist items for this task.</div>
            ) : (
              <div className="pm-checklist">
                {items.map((it, i) => (
                  <label key={i} className="pm-check-row">
                    <input
                      type="checkbox"
                      checked={!!checked[i]}
                      onChange={(e) => setChecked((c) => ({ ...c, [i]: e.target.checked }))}
                    />
                    <span className={checked[i] ? 'pm-check-done' : ''}>{it}</span>
                  </label>
                ))}
                {items.length > 0 && (
                  <div className="pm-check-progress">{doneCount} of {items.length} checked</div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-primary" onClick={() => setCompleting(true)}>Mark complete</button>
            </div>
          </div>
        </div>

        {completing && (
          <div className="modal-overlay" onClick={() => !saving && setCompleting(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <span className="modal-title">Complete {intervalLabel(selTask.interval_days)} maintenance</span>
                <button className="modal-close" onClick={() => !saving && setCompleting(false)}>×</button>
              </div>
              <div className="modal-body">
                <div className="field-group">
                  <label className="field-label">Performed by</label>
                  <input className="field-input" value={doneBy} onChange={(e) => setDoneBy(e.target.value)} placeholder="Your name" autoFocus />
                </div>
                <div className="field-group">
                  <label className="field-label">Date performed</label>
                  <input className="field-input" type="date" value={doneOn} max={todayISO()} onChange={(e) => setDoneOn(e.target.value)} />
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-ghost" onClick={() => setCompleting(false)} disabled={saving}>Cancel</button>
                <button className="btn btn-primary" onClick={submitCompletion} disabled={saving || !doneOn}>
                  {saving ? <><span className="spinner" /> Saving…</> : 'Complete & reset'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Single machine: its tasks ──
  if (selMachine) {
    const mt = tasksFor(selMachine.id);
    return (
      <div className="repair-wrap">
        <button className="back-link" onClick={() => setSelMachine(null)} style={{ marginBottom: 12 }}>← All machines</button>
        <div className="section">
          <div className="section-header">
            <span className="section-title"><span className="section-title-dot" /> {selMachine.name}</span>
          </div>
          <div className="section-body" style={{ paddingTop: '0.5rem', paddingBottom: '0.5rem' }}>
            {mt.length === 0 ? (
              <div className="picker-empty">No preventative-maintenance tasks set for this machine.</div>
            ) : (
              <div className="machine-edit-list">
                {mt.map((t) => {
                  const d = daysUntilDue(t);
                  const b = bucketOf(d);
                  return (
                    <button key={t.id} className="pm-task-row" onClick={() => openTask(t)}>
                      <span className={`pm-dot pm-dot-${b}`} />
                      <span className="pm-task-info">
                        <span className="pm-task-name">{intervalLabel(t.interval_days)}</span>
                        <span className="pm-task-meta">{dueText(d)}</span>
                      </span>
                      <span className="pm-task-arrow">›</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Dashboard ──
  const overall = tally(tasks);
  const machinesWithTasks = machines.filter((m) => tasksFor(m.id).length > 0);

  return (
    <div className="repair-wrap">
      <button className="back-link" onClick={onBack} style={{ marginBottom: 12 }}>← Home</button>

      <div className="section">
        <div className="section-header">
          <span className="section-title"><span className="section-title-dot" /> Maintenance due</span>
        </div>
        <div className="section-body">
          <Counts counts={overall} size="lg" />
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <span className="section-title"><span className="section-title-dot" /> Machines</span>
        </div>
        <div className="section-body" style={{ paddingTop: '0.5rem', paddingBottom: '0.5rem' }}>
          {machinesWithTasks.length === 0 ? (
            <div className="picker-empty">
              No machines have preventative-maintenance tasks yet. Set them up in Edit Machines → Edit Machine → Preventative Maintenance.
            </div>
          ) : (
            <div className="machine-edit-list">
              {machinesWithTasks.map((m) => (
                <button key={m.id} className="pm-machine-row" onClick={() => setSelMachine(m)}>
                  <span className="pm-machine-name">{m.name}</span>
                  <Counts counts={tally(tasksFor(m.id))} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
