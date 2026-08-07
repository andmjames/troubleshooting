import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { fetchRepairLogs, fetchAllRepairLogs, updateRepairLog, removeRepairLog, signedUrl, uploadRepairPhoto, fetchUsers } from '../lib/supabase';
import { IconPlus } from '../lib/icons';
import Lightbox from './Lightbox';
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

const PIE_COLORS = (i, n) => `hsl(${Math.round((i * 360) / Math.max(n, 1))}, 62%, 55%)`;

// Simple SVG pie chart. slices: [{ name, count }]. Renders slices + a legend.
function PieChart({ slices }) {
  const total = slices.reduce((s, x) => s + x.count, 0);
  if (!total) return <div className="picker-empty">No repairs to chart yet.</div>;
  const r = 90; const cx = 100; const cy = 100;
  let angle = -Math.PI / 2;
  const paths = slices.map((s, i) => {
    const frac = s.count / total;
    const color = PIE_COLORS(i, slices.length);
    if (frac >= 0.9999) {
      // single machine = full circle
      return <circle key={i} cx={cx} cy={cy} r={r} fill={color} />;
    }
    const a0 = angle; const a1 = angle + frac * 2 * Math.PI; angle = a1;
    const x0 = cx + r * Math.cos(a0); const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1); const y1 = cy + r * Math.sin(a1);
    const large = frac > 0.5 ? 1 : 0;
    const d = `M ${cx} ${cy} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
    return <path key={i} d={d} fill={color} stroke="#fff" strokeWidth="1.5" />;
  });
  return (
    <div className="pie-wrap">
      <svg className="pie-svg" viewBox="0 0 200 200" role="img" aria-label="Repairs by machine">{paths}</svg>
      <div className="pie-legend">
        {slices.map((s, i) => (
          <div key={i} className="pie-legend-row">
            <span className="pie-swatch" style={{ background: PIE_COLORS(i, slices.length) }} />
            <span className="pie-legend-name">{s.name}</span>
            <span className="pie-legend-val">{s.count} ({Math.round((s.count / total) * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Bar chart: % of repairs requiring Andrew's input, by month.
function MonthlyAndrewChart({ months }) {
  if (!months.some((m) => m.total > 0)) return <div className="picker-empty">No maintenance repairs in the last 6 months.</div>;
  return (
    <div className="mbar-chart">
      {months.map((m, i) => (
        <div key={i} className="mbar-col">
          <div className="mbar-pct">{m.pct == null ? '—' : `${Math.round(m.pct)}%`}</div>
          <div className="mbar-track"><div className="mbar-fill" style={{ height: `${m.pct == null ? 0 : m.pct}%` }} /></div>
          <div className="mbar-label">{m.label}</div>
          <div className="mbar-sub">{m.total ? `${m.required}/${m.total}` : '—'}</div>
        </div>
      ))}
    </div>
  );
}

// Ranked horizontal bars: repairs per machine over the last 90 days.
function RankedMachines({ ranking, emptyText = 'No repairs in the last 90 days.' }) {
  if (!ranking.length) return <div className="picker-empty">{emptyText}</div>;
  const max = ranking[0].count || 1;
  return (
    <div className="rank-list">
      {ranking.map((r, i) => (
        <div key={i} className="rank-row">
          <span className="rank-name">{r.name}</span>
          <span className="rank-bar-track"><span className="rank-bar-fill" style={{ width: `${(r.count / max) * 100}%` }} /></span>
          <span className="rank-count">{r.count}</span>
        </div>
      ))}
    </div>
  );
}

function AnalyticsPanel({ analytics, onBack }) {
  const pct = (v) => `${Math.round(v)}%`;
  return (
    <div className="repair-wrap">
      <button className="back-link" onClick={onBack} style={{ marginBottom: 12 }}>← Back to entries</button>
      <div className="repair-context-bar">Repair analytics <span className="repair-context-machine">(all machines)</span></div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-value">{pct(analytics.pctAll)}</div>
          <div className="stat-label">of maintenance repairs required input from Andrew J</div>
          <div className="stat-sub">{analytics.requiredAll} of {analytics.maintTotal} maintenance repairs</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{pct(analytics.pctRecent)}</div>
          <div className="stat-label">of last-90-day maintenance repairs required input from Andrew J</div>
          <div className="stat-sub">{analytics.recentRequired} of {analytics.recentMaintTotal}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{analytics.recentTotal}</div>
          <div className="stat-label">total repairs logged in the last 90 days</div>
        </div>
      </div>

      <div className="section" style={{ marginTop: 16 }}>
        <div className="section-header">
          <span className="section-title"><span className="section-title-dot" /> % of maintenance repairs requiring Andrew J input — by month</span>
        </div>
        <div className="section-body">
          <MonthlyAndrewChart months={analytics.months} />
        </div>
      </div>

      <div className="section" style={{ marginTop: 16 }}>
        <div className="section-header">
          <span className="section-title"><span className="section-title-dot" /> Repairs by user — all time</span>
        </div>
        <div className="section-body">
          <RankedMachines ranking={analytics.userRanking} emptyText="No repairs recorded yet." />
        </div>
      </div>

      <div className="section" style={{ marginTop: 16 }}>
        <div className="section-header">
          <span className="section-title"><span className="section-title-dot" /> Repairs by machine — last 90 days</span>
        </div>
        <div className="section-body">
          <RankedMachines ranking={analytics.recentRanking} />
        </div>
      </div>

      <div className="section" style={{ marginTop: 16 }}>
        <div className="section-header">
          <span className="section-title"><span className="section-title-dot" /> Repairs by machine — all time</span>
        </div>
        <div className="section-body">
          <PieChart slices={analytics.machineSlices} />
        </div>
      </div>
    </div>
  );
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

export default function RepairLogManager({ machine, onBack, allMachines = false, analyticsOnly = false, machineFilter, isMaintenance = false, isAdmin = false }) {
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
  const [andrewInput, setAndrewInput] = useState(null);   // 'yes' | 'no' | null
  const [showAnalytics, setShowAnalytics] = useState(analyticsOnly);
  const [maintenanceNames, setMaintenanceNames] = useState(() => new Set());

  // Which technicians are Maintenance-role users. The Andrew-J field only applies
  // to their repairs, and it feeds the Andrew-J analytics.
  useEffect(() => {
    let alive = true;
    fetchUsers()
      .then((us) => {
        if (!alive) return;
        setMaintenanceNames(new Set(us.filter((u) => u.maintenance).map((u) => (u.name || '').trim())));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // The Andrew-J question is only relevant for a repair made by a Maintenance user.
  const techIsMaintenance = (t) => !!t && maintenanceNames.has(t.trim());
  // Maintenance users and admins can see/record it; regular users cannot.
  const canSeeAndrew = isMaintenance || isAdmin;

  const analytics = useMemo(() => {
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const isRecent = (l) => l.created_at && new Date(l.created_at).getTime() >= cutoff;

    // Andrew-J metrics count ONLY repairs made by users flagged Maintenance.
    const maintLogs = logs.filter((l) => l.technician && maintenanceNames.has(l.technician.trim()));
    const maintTotal = maintLogs.length;
    const requiredAll = maintLogs.filter((l) => l.required_andrew_input === true).length;
    const recentMaint = maintLogs.filter(isRecent);
    const recentMaintTotal = recentMaint.length;
    const recentRequired = recentMaint.filter((l) => l.required_andrew_input === true).length;

    // Volume metrics (totals, pie, rankings) count ALL repairs.
    const recentTotal = logs.filter(isRecent).length;
    const byMachine = {};
    logs.forEach((l) => {
      const names = Array.isArray(l.machine_names) && l.machine_names.length ? l.machine_names : [l.machine_name || l.machine_id || 'Unknown'];
      names.forEach((n) => { byMachine[n] = (byMachine[n] || 0) + 1; });
    });
    const machineSlices = Object.entries(byMachine)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    // Repairs grouped by user (technician), all-time.
    const byUser = {};
    logs.forEach((l) => { const n = (l.technician || '').trim() || 'Unknown'; byUser[n] = (byUser[n] || 0) + 1; });
    const userRanking = Object.entries(byUser)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    // % requiring Andrew's input by month (maintenance repairs only) — last 6 months.
    const now = new Date();
    const months = [];
    const monthIndex = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      monthIndex[key] = months.length;
      months.push({ key, label: d.toLocaleString('en-US', { month: 'short' }), total: 0, required: 0, pct: null });
    }
    maintLogs.forEach((l) => {
      if (!l.created_at) return;
      const d = new Date(l.created_at);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const idx = monthIndex[key];
      if (idx != null) { months[idx].total += 1; if (l.required_andrew_input === true) months[idx].required += 1; }
    });
    months.forEach((m) => { m.pct = m.total ? (m.required / m.total) * 100 : null; });

    // Repairs by machine — last 90 days, ranked (all repairs).
    const recentByMachine = {};
    logs.filter(isRecent).forEach((l) => {
      const names = Array.isArray(l.machine_names) && l.machine_names.length ? l.machine_names : [l.machine_name || l.machine_id || 'Unknown'];
      names.forEach((n) => { recentByMachine[n] = (recentByMachine[n] || 0) + 1; });
    });
    const recentRanking = Object.entries(recentByMachine)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return {
      requiredAll, maintTotal,
      pctAll: maintTotal ? (requiredAll / maintTotal) * 100 : 0,
      recentRequired, recentMaintTotal,
      pctRecent: recentMaintTotal ? (recentRequired / recentMaintTotal) * 100 : 0,
      recentTotal,
      machineSlices,
      userRanking,
      months,
      recentRanking,
    };
  }, [logs, maintenanceNames]);
  const [probPhotos, setProbPhotos] = useState([]);
  const [solPhotos, setSolPhotos] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let data = await (allMachines ? fetchAllRepairLogs() : fetchRepairLogs(machine.id));
      // Restrict to the user's machines (empty filter = all machines).
      if (allMachines && Array.isArray(machineFilter) && machineFilter.length) {
        const set = new Set(machineFilter.map(Number));
        data = data.filter((l) => {
          const ids = Array.isArray(l.machine_ids) && l.machine_ids.length ? l.machine_ids : [l.machine_id];
          return ids.some((id) => set.has(Number(id)));
        });
      }
      setLogs(data);
    } catch (e) {
      toast(e.message || 'Could not load repair logs', 'error');
    } finally {
      setLoading(false);
    }
  }, [allMachines, machine, toast, machineFilter]);

  useEffect(() => { load(); }, [load]);

  const startEdit = (log) => {
    setProblem(log.problem || '');
    setSolution(log.solution || '');
    setDetails(log.details || '');
    setTechnician(log.technician || '');
    setAndrewInput(log.required_andrew_input === true ? 'yes' : log.required_andrew_input === false ? 'no' : null);
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
    if (canSeeAndrew && techIsMaintenance(technician) && !andrewInput) { toast('Select whether this required input from Andrew J', 'error'); return; }
    setSaving(true);
    try {
      const [pPhotos, sPhotos] = await Promise.all([uploadGroup(probPhotos), uploadGroup(solPhotos)]);
      const payload = {
        problem, solution, details, technician,
        problem_photos: pPhotos, solution_photos: sPhotos,
      };
      // Only maintenance users can view/change this; otherwise leave it untouched.
      if (canSeeAndrew && techIsMaintenance(technician)) payload.required_andrew_input = andrewInput === 'yes';
      await updateRepairLog(editing, payload);
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
            {canSeeAndrew && techIsMaintenance(technician) && (
              <div className="field-group" style={{ marginTop: 12 }}>
                <label className="field-label">Did this repair require input from Andrew J? <span className="field-req">*</span></label>
                <div className="radio-row">
                  <label className="radio-opt">
                    <input type="radio" name="editAndrewInput" checked={andrewInput === 'yes'} onChange={() => setAndrewInput('yes')} />
                    <span>Yes</span>
                  </label>
                  <label className="radio-opt">
                    <input type="radio" name="editAndrewInput" checked={andrewInput === 'no'} onChange={() => setAndrewInput('no')} />
                    <span>No</span>
                  </label>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={cancelEdit} disabled={saving}>Cancel</button>
              <button className="btn btn-primary" onClick={saveEdit} disabled={saving || !problem.trim() || (canSeeAndrew && techIsMaintenance(technician) && !andrewInput)}>
                {saving ? <><span className="spinner" /> Saving…</> : 'Save changes'}
              </button>
            </div>
          </div>
        </div>

        {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
      </div>
    );
  }

  // ── List view ──
  if (allMachines && showAnalytics) {
    if (loading) {
      return (
        <div className="repair-wrap">
          <button className="back-link" onClick={onBack} style={{ marginBottom: 12 }}>← Back</button>
          <div className="loading-state"><span className="spinner" /> Loading analytics…</div>
        </div>
      );
    }
    return <AnalyticsPanel analytics={analytics} onBack={analyticsOnly ? onBack : () => setShowAnalytics(false)} />;
  }

  return (
    <div className="repair-wrap">
      <button className="back-link" onClick={onBack} style={{ marginBottom: 12 }}>
        {allMachines ? '← Back' : '← Edit Machines'}
      </button>

      <div className="repair-context-bar">
        <span style={{ flex: 1 }}>
          {allMachines
            ? <>Repair logs <span className="repair-context-machine">{Array.isArray(machineFilter) && machineFilter.length ? '(your machines)' : '(every machine)'}</span></>
            : <>Repair log for <span className="repair-context-machine">{machine.name}</span></>}
        </span>
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
            <div className="picker-empty">{allMachines ? 'No repair logs recorded yet.' : 'No repair logs for this machine yet.'}</div>
          ) : (
            <div className="log-list">
              {logs.map((log) => {
                const pPhotos = log.problem_photos || [];
                const sPhotos = log.solution_photos || [];
                return (
                  <div key={log.id} className="log-entry">
                    {allMachines && <div className="log-entry-machine">{Array.isArray(log.machine_names) && log.machine_names.length ? log.machine_names.join(', ') : log.machine_name}</div>}
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

                    {canSeeAndrew && techIsMaintenance(log.technician) && <>
                      <div className="log-field-label">Required input from Andrew J?</div>
                      <div className="log-field-text">
                        {log.required_andrew_input === true ? 'Yes'
                          : log.required_andrew_input === false ? 'No'
                          : <span className="log-notset">Not set — tap Edit to record it</span>}
                      </div>
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

      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}
