import React, { useEffect, useState, useCallback } from 'react';
import { fetchUsers, addUser, removeUser, updateUser } from '../lib/supabase';
import { IconPlus } from '../lib/icons';
import { useToast } from './Toast';

// Areas a user can be granted access to.
export const PERMISSIONS = [
  { key: 'preventative_maintenance', label: 'Preventative maintenance' },
  { key: 'settings', label: 'Settings' },
  { key: 'edit_machines', label: 'Edit machines' },
  { key: 'analytics', label: 'Analytics' },
];

// Effective access check: admins have full access; everyone else uses their grants.
export function hasPermission(user, key) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return !!(user.permissions && user.permissions[key]);
}

function permSummary(u) {
  if (u.role === 'admin') return 'Admin · full access';
  const granted = PERMISSIONS.filter((p) => u.permissions && u.permissions[p.key]).map((p) => p.label);
  return granted.length ? granted.join(', ') : 'No access granted';
}

export default function Settings({ onBack }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [permTarget, setPermTarget] = useState(null);   // user whose permissions are open
  const [permRole, setPermRole] = useState('user');
  const [permDraft, setPermDraft] = useState({});
  const [permSaving, setPermSaving] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try { setUsers(await fetchUsers()); }
    catch (e) { toast(e.message || 'Could not load users', 'error'); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    const n = name.trim();
    if (!n) { toast('Enter a name', 'error'); return; }
    setAdding(true);
    try {
      await addUser(n);
      setName('');
      await load();
      toast('User added', 'success');
    } catch (e) {
      toast(e.message || 'Could not add user', 'error');
    } finally {
      setAdding(false);
    }
  };

  const doRemove = async () => {
    setRemoving(true);
    try {
      await removeUser(confirmDel.id);
      setConfirmDel(null);
      await load();
      toast('User removed', 'success');
    } catch (e) {
      toast(e.message || 'Could not remove user', 'error');
    } finally {
      setRemoving(false);
    }
  };

  const openPerms = (u) => { setPermTarget(u); setPermRole(u.role || 'user'); setPermDraft({ ...(u.permissions || {}) }); };
  const togglePerm = (key) => setPermDraft((d) => ({ ...d, [key]: !d[key] }));
  const savePerms = async () => {
    setPermSaving(true);
    try {
      await updateUser(permTarget.id, { role: permRole, permissions: permDraft });
      setPermTarget(null);
      await load();
      toast('Permissions saved', 'success');
    } catch (e) {
      toast(e.message || 'Could not save permissions', 'error');
    } finally {
      setPermSaving(false);
    }
  };

  return (
    <div className="repair-wrap">
      <button className="back-link" onClick={onBack} style={{ marginBottom: 12 }}>← Home</button>

      <div className="section">
        <div className="section-header">
          <span className="section-title"><span className="section-title-dot" /> Users</span>
        </div>
        <div className="section-body">
          <div className="field-group">
            <label className="field-label">Add a user</label>
            <div className="user-add-row">
              <input
                className="field-input"
                value={name}
                placeholder="Full name"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
              />
              <button className="btn btn-primary" onClick={add} disabled={adding || !name.trim()}>
                {adding ? <><span className="spinner" /> Adding…</> : <><IconPlus /> Add</>}
              </button>
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            {loading ? (
              <div className="loading-state"><span className="spinner" /> Loading…</div>
            ) : users.length === 0 ? (
              <div className="picker-empty">No users yet. Add one above.</div>
            ) : (
              <div className="machine-edit-list">
                {users.map((u) => (
                  <div key={u.id} className="machine-edit-row user-row" onClick={() => openPerms(u)}>
                    <div className="machine-edit-info">
                      <div className="machine-edit-name">{u.name}</div>
                      <div className="machine-edit-meta">{permSummary(u)}</div>
                    </div>
                    <span className="user-row-chevron" aria-hidden="true">›</span>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={(e) => { e.stopPropagation(); setConfirmDel(u); }}
                    >Remove</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {permTarget && (
        <div className="modal-overlay" onClick={() => !permSaving && setPermTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Permissions — {permTarget.name}</span>
              <button className="modal-close" onClick={() => !permSaving && setPermTarget(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="field-group">
                <label className="field-label">Role</label>
                <div className="radio-row">
                  <label className="radio-opt">
                    <input type="radio" name="role" checked={permRole === 'admin'} onChange={() => setPermRole('admin')} />
                    <span>Admin</span>
                  </label>
                  <label className="radio-opt">
                    <input type="radio" name="role" checked={permRole !== 'admin'} onChange={() => setPermRole('user')} />
                    <span>Standard</span>
                  </label>
                </div>
              </div>

              {permRole === 'admin' ? (
                <p className="perm-hint" style={{ marginTop: 14 }}>Admins have full access to every area, including all permissions.</p>
              ) : (
                <div style={{ marginTop: 14 }}>
                  <p className="perm-hint">Choose which areas this user can access.</p>
                  <div className="perm-list">
                    {PERMISSIONS.map((p) => (
                      <label key={p.key} className="perm-row">
                        <span>{p.label}</span>
                        <input type="checkbox" checked={!!permDraft[p.key]} onChange={() => togglePerm(p.key)} />
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setPermTarget(null)} disabled={permSaving}>Cancel</button>
              <button className="btn btn-primary" onClick={savePerms} disabled={permSaving}>
                {permSaving ? <><span className="spinner" /> Saving…</> : 'Save permissions'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDel && (
        <div className="modal-overlay" onClick={() => !removing && setConfirmDel(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Remove user</span>
              <button className="modal-close" onClick={() => !removing && setConfirmDel(null)}>×</button>
            </div>
            <div className="modal-body">
              <p className="confirm-text">Remove <strong>{confirmDel.name}</strong> from the users list?</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setConfirmDel(null)} disabled={removing}>Cancel</button>
              <button className="btn btn-danger" onClick={doRemove} disabled={removing}>
                {removing ? <><span className="spinner" /> Removing…</> : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
