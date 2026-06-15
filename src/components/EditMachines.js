import React, { useEffect, useState, useCallback } from 'react';
import { fetchMachines, fetchManualCounts, addMachine, updateMachine, removeMachine } from '../lib/supabase';
import { useToast } from './Toast';

const EMPTY = { name: '', manufacturer: '', model_number: '', manufacturer_phone: '', manufacturer_email: '', serial_number: '' };

// Password required to remove a machine. Note: this is checked in the browser,
// so it guards against accidental/casual deletion, not a determined user.
const REMOVE_PASSWORD = 'Purdue2009';

export default function EditMachines({ onBack, onAddManual, onAddManualViaPicker }) {
  const [machines, setMachines] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [confirmTarget, setConfirmTarget] = useState(null); // machine pending removal
  const [removing, setRemoving] = useState(false);
  const [removePw, setRemovePw] = useState('');
  const [removePwError, setRemovePwError] = useState(false);

  const [editTarget, setEditTarget] = useState(null);       // machine being edited
  const [editForm, setEditForm] = useState(EMPTY);
  const [editSaving, setEditSaving] = useState(false);

  // New-machine form
  const [form, setForm] = useState(EMPTY);

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

  const setField = (setter) => (key) => (e) => setter((f) => ({ ...f, [key]: e.target.value }));
  const onAddField = setField(setForm);
  const onEditField = setField(setEditForm);

  const add = async () => {
    if (!form.name.trim()) { toast('Enter a machine name', 'error'); return; }
    setSaving(true);
    try {
      await addMachine(form);
      toast('Machine added', 'success');
      setForm(EMPTY);
      await load();
    } catch (e) {
      toast(e.message || 'Could not add machine', 'error');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (m) => {
    setEditForm({
      name: m.name || '',
      manufacturer: m.manufacturer || '',
      model_number: m.model_number || '',
      manufacturer_phone: m.manufacturer_phone || '',
      manufacturer_email: m.manufacturer_email || '',
      serial_number: m.serial_number || '',
    });
    setEditTarget(m);
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    if (!editForm.name.trim()) { toast('Machine name is required', 'error'); return; }
    setEditSaving(true);
    try {
      await updateMachine(editTarget.id, editForm);
      toast('Machine updated', 'success');
      setEditTarget(null);
      await load();
    } catch (e) {
      toast(e.message || 'Could not update machine', 'error');
    } finally {
      setEditSaving(false);
    }
  };

  const openRemove = (m) => { setRemovePw(''); setRemovePwError(false); setConfirmTarget(m); };
  const closeRemove = () => { if (removing) return; setConfirmTarget(null); setRemovePw(''); setRemovePwError(false); };

  const doRemove = async () => {
    if (!confirmTarget) return;
    if (removePw !== REMOVE_PASSWORD) { setRemovePwError(true); return; }
    setRemoving(true);
    try {
      await removeMachine(confirmTarget.id);
      toast(`Removed ${confirmTarget.name}`, 'success');
      setConfirmTarget(null);
      setRemovePw('');
      setRemovePwError(false);
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
              <input className="field-input" value={form.name} onChange={onAddField('name')} placeholder="e.g. Slitter - TG310" />
            </div>
            <div className="field-group">
              <label className="field-label">Manufacturer</label>
              <input className="field-input" value={form.manufacturer} onChange={onAddField('manufacturer')} placeholder="e.g. Shanklin" />
            </div>
          </div>
          <div className="field-grid-2" style={{ marginTop: 12 }}>
            <div className="field-group">
              <label className="field-label">Model number</label>
              <input className="field-input" value={form.model_number} onChange={onAddField('model_number')} placeholder="e.g. A26A" />
            </div>
            <div className="field-group">
              <label className="field-label">Serial number</label>
              <input className="field-input" value={form.serial_number} onChange={onAddField('serial_number')} placeholder="off the data plate" />
            </div>
          </div>
          <div className="field-grid-2" style={{ marginTop: 12 }}>
            <div className="field-group">
              <label className="field-label">Manufacturer phone</label>
              <input className="field-input" type="tel" value={form.manufacturer_phone} onChange={onAddField('manufacturer_phone')} placeholder="support line" />
            </div>
            <div className="field-group">
              <label className="field-label">Manufacturer email</label>
              <input className="field-input" type="email" value={form.manufacturer_email} onChange={onAddField('manufacturer_email')} placeholder="support@…" />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
            <button className="btn btn-primary" onClick={add} disabled={saving || !form.name.trim()}>
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
              {machines.map((m) => {
                const meta = [m.manufacturer, m.model_number].filter(Boolean).join(' · ') || 'No make/model set';
                const cnt = counts[m.id];
                return (
                  <div key={m.id} className="machine-edit-row">
                    <div className="machine-edit-info">
                      <div className="machine-edit-name">{m.name}</div>
                      <div className="machine-edit-meta">
                        {meta}{cnt ? ` · ${cnt} manual${cnt > 1 ? 's' : ''}` : ' · no manuals'}
                      </div>
                    </div>
                    <div className="machine-edit-actions">
                      <button className="btn btn-sm" onClick={() => openEdit(m)}>Edit Machine</button>
                      <button className="btn btn-sm btn-danger" onClick={() => openRemove(m)}>Remove</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Edit machine modal */}
      {editTarget && (
        <div className="modal-overlay" onClick={() => !editSaving && setEditTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Edit {editTarget.name}</span>
              <button className="modal-close" onClick={() => !editSaving && setEditTarget(null)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <span className="field-label" style={{ margin: 0 }}>
                  {counts[editTarget.id] ? `${counts[editTarget.id]} manual${counts[editTarget.id] > 1 ? 's' : ''} on file` : 'No manuals yet'}
                </span>
                <button className="btn btn-sm" onClick={() => onAddManual(editTarget)}>Add manual</button>
              </div>

              <div className="field-group">
                <label className="field-label">Machine name *</label>
                <input className="field-input" value={editForm.name} onChange={onEditField('name')} />
              </div>
              <div className="field-grid-2">
                <div className="field-group">
                  <label className="field-label">Manufacturer</label>
                  <input className="field-input" value={editForm.manufacturer} onChange={onEditField('manufacturer')} />
                </div>
                <div className="field-group">
                  <label className="field-label">Model number</label>
                  <input className="field-input" value={editForm.model_number} onChange={onEditField('model_number')} />
                </div>
              </div>
              <div className="field-group">
                <label className="field-label">Serial number</label>
                <input className="field-input" value={editForm.serial_number} onChange={onEditField('serial_number')} placeholder="off the data plate" />
              </div>
              <div className="field-grid-2">
                <div className="field-group">
                  <label className="field-label">Manufacturer phone</label>
                  <input className="field-input" type="tel" value={editForm.manufacturer_phone} onChange={onEditField('manufacturer_phone')} />
                </div>
                <div className="field-group">
                  <label className="field-label">Manufacturer email</label>
                  <input className="field-input" type="email" value={editForm.manufacturer_email} onChange={onEditField('manufacturer_email')} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setEditTarget(null)} disabled={editSaving}>Cancel</button>
              <button className="btn btn-primary" onClick={saveEdit} disabled={editSaving || !editForm.name.trim()}>
                {editSaving ? <><span className="spinner" /> Saving…</> : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove confirmation */}
      {confirmTarget && (
        <div className="modal-overlay" onClick={closeRemove}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Remove {confirmTarget.name}?</span>
              <button className="modal-close" onClick={closeRemove}>×</button>
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
              <div className="field-group">
                <label className="field-label">Enter the password to remove</label>
                <input
                  className="field-input"
                  type="password"
                  value={removePw}
                  onChange={(e) => { setRemovePw(e.target.value); setRemovePwError(false); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') doRemove(); }}
                  placeholder="Password"
                  autoComplete="off"
                  autoFocus
                  disabled={removing}
                />
                {removePwError && (
                  <span style={{ fontSize: 12, color: 'var(--danger)', marginTop: 2 }}>
                    Incorrect password.
                  </span>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={closeRemove} disabled={removing}>Cancel</button>
              <button className="btn btn-danger" onClick={doRemove} disabled={removing || !removePw}>
                {removing ? <><span className="spinner" /> Removing…</> : 'Remove machine'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
