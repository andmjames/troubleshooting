import React, { useEffect, useState, useCallback } from 'react';
import { fetchUsers, addUser, removeUser } from '../lib/supabase';
import { IconPlus } from '../lib/icons';
import { useToast } from './Toast';

export default function Settings({ onBack }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [removing, setRemoving] = useState(false);
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
                  <div key={u.id} className="machine-edit-row">
                    <div className="machine-edit-info">
                      <div className="machine-edit-name">{u.name}</div>
                    </div>
                    <button className="btn btn-sm btn-danger" onClick={() => setConfirmDel(u)}>Remove</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

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
