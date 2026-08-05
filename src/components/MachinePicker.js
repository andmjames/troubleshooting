import React, { useEffect, useState, useMemo } from 'react';
import { fetchMachines } from '../lib/supabase';
import { useToast } from './Toast';

export default function MachinePicker({ mode, onSelect, onBack, actionLabel, onAction }) {
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const toast = useToast();

  useEffect(() => {
    let alive = true;
    fetchMachines()
      .then((m) => { if (alive) { setMachines(m); setLoading(false); } })
      .catch((e) => { toast(e.message || 'Could not load machines', 'error'); setLoading(false); });
    return () => { alive = false; };
  }, [toast]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return machines;
    return machines.filter((m) =>
      m.name.toLowerCase().includes(t) ||
      (m.model_number || '').toLowerCase().includes(t) ||
      (m.manufacturer || '').toLowerCase().includes(t)
    );
  }, [q, machines]);

  const title = mode === 'repair' ? 'Log a solution'
    : mode === 'manual' ? 'Add a manual'
    : 'Troubleshooting help';
  const sub = mode === 'repair'
    ? 'Which machine is this solution for?'
    : mode === 'manual'
      ? 'Which machine is this manual for?'
      : 'Which machine are you having trouble with?';

  return (
    <div className="picker-wrap">
      <button className="back-link" onClick={onBack} style={{ marginBottom: 12 }}>← Home</button>
      <div className="picker-card">
        <div className="picker-head">
          <div>
            <div className="picker-eyebrow">{title}</div>
            <h1 className="picker-title">Select a machine</h1>
          </div>
          {actionLabel && onAction && (
            <button className="btn btn-sm" onClick={onAction}>{actionLabel}</button>
          )}
        </div>
        <p className="picker-sub">{sub}</p>

        <input
          className="picker-search"
          placeholder="Search machines…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />

        {loading ? (
          <div className="loading-state"><span className="spinner" /> Loading machines…</div>
        ) : filtered.length === 0 ? (
          <div className="picker-empty">No machines match "{q}".</div>
        ) : (
          <div className="picker-list">
            {filtered.map((m) => (
              <button key={m.id} className="picker-item" onClick={() => onSelect(m)}>
                <span>{m.name}</span>
                {m.model_number && <span className="picker-item-model">{m.model_number}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
