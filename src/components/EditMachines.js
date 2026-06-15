import React, { useEffect, useState, useCallback } from 'react';
import { fetchMachines, fetchManualCounts, addMachine, removeMachine } from '../lib/supabase';
import { useToast } from './Toast';

export default function EditMachines({ onBack, onAddManual, onAddManualViaPicker }) {
  const [machines, setMachines] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState(null); // machine pending removal
  const [removing, setRemoving] = useState(false);

  // New-machine form
  const [name, setName] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [model, setModel] = useState('');

  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, c] = await Promise.all([fetchMachines(), fetchManualCounts()]);
      setMachines(m);
      setCounts(c);
    } catch (e) {
      toast(e.message || 'Could not load machines', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!name.trim()) { toast('Enter a machine name', 'error'); return; }
    setSaving(true);
    try {
      await addMachine({ name, manufacturer, model_number: model });
      toast('Machine added', 'success');
      setName(''); setManufacturer(''); setModel('');
      await load();
    } catch (e) {
      toast(e.message || 'Could not add machine', 'error');
    } finally {
      setSaving(false);
    }
  };

  const doRemove = async () => {
    if (!confirmTarget) return;
    setRemoving(true);
    try {
      await removeMachine(confirmTarget.id);
      toast(`Removed ${confirmTarget.name}`, 'success');
      setConfirmTarget(null);
      await load();
    } catch (e) {
      toast(e.message || 'Could not remove machine', 'error');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="repair-wrap">
      <button className="back-link" onClick={onBack} style={{ marginBottom: 12 }}>← Home</button>

      {/* Quick action: add a manual (pick the machine on the next screen) */}
      <div className="edit-actions-bar">
        <span className="edit-actions-label">Manuals & machines</span>
        <button className="btn btn-sm" onClick={onAddManualViaPicker}>Add a manual</button>
      </div>

      {/* Add a machine */}
      <div className="section">
        <div className="section-header">
          <span className="section-title"><span className="section-title-dot" /> Add a machine</span>
        </div>
        <div className="section-body">
          <div className="field-grid-2">
            <div className="field-group">
              <label className="field-label">Machine name *</label>
              <input
                className="field-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Slitter - TG310"
              />
            </div>
            <div className="field-group">
              <label className="field-label">Manufacturer</label>
              <input
                className="field-input"
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                placeholder="e.g. Shanklin"
              />
            </div>
          </div>
          <div className="field-group" style={{ marginTop: 12 }}>
            <label className="field-label">Model number</label>
            <input
              className="field-input"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="e.g. A26A"
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
            <button className="btn btn-primary" onClick={add} disabled={saving || !name.trim()}>
              {saving ? <><span className="spinner" /> Adding…</> : 'Add machine'}
            </button>
          </div>
        </div>
      </div>

      {/* Existing machines */}
      <div className="section">
        <div className="section-header">
          <span className="section-title">
            <span className="section-title-dot" /> Machines{machines.length ? ` (${machines.length})` : ''}
          </span>
        </div>
        <div className="section-body" style={{ paddingTop: '0.5rem', paddingBottom: '0.5rem' }}>
          {loading ? (
            <div className="loading-state"><span className="spinner" /> Loading…</div>
          ) : machines.length === 0 ? (
            <div className="picker-empty">No machines yet — add one above.</div>
          ) : (
            <div className="machine-edit-list">
              {machines.map((m) => (
                <div key={m.id} className="machine-edit-row">
                  <div className="machine-edit-info">
                    <div className="machine-edit-name">{m.name}</div>
                    <div className="machine-edit-meta">
                      {[m.manufacturer, m.model_number].filter(Boolean).join(' · ') || 'No make/model set'}
                      {counts[m.id] ? ` · ${counts[m.id]} manual${counts[m.id] > 1 ? 's' : ''}` : ' · no manuals'}
                    </div>
                  </div>
                  <div className="machine-edit-actions">
                    <button className="btn btn-sm" onClick={() => onAddManual(m)}>Add manual</button>
                    <button className="btn btn-sm btn-danger" onClick={() => setConfirmTarget(m)}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Remove confirmation */}
      {confirmTarget && (
        <div className="modal-overlay" onClick={() => !removing && setConfirmTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Remove {confirmTarget.name}?</span>
              <button className="modal-close" onClick={() => !removing && setConfirmTarget(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)' }}>
                This permanently removes the machine along with{' '}
                <strong>
                  {counts[confirmTarget.id] ? `its ${counts[confirmTarget.id]} manual${counts[confirmTarget.id] > 1 ? 's' : ''} and ` : ''}
                  all of its repair logs
                </strong>
                . This can't be undone.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setConfirmTarget(null)} disabled={removing}>Cancel</button>
              <button className="btn btn-danger" onClick={doRemove} disabled={removing}>
                {removing ? <><span className="spinner" /> Removing…</> : 'Remove machine'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
