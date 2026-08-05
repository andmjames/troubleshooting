import React, { useEffect, useState } from 'react';
import { fetchUsers } from '../lib/supabase';

export default function UserPicker({ onPick, notFound }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchUsers()
      .then((us) => { if (alive) { setUsers(us); setLoading(false); } })
      .catch(() => { if (alive) { setError(true); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  return (
    <div className="picker-wrap">
      <div className="picker-eyebrow">PMI Tape · Troubleshooting</div>
      <h1 className="picker-title">Who are you?</h1>
      <p className="picker-sub">
        {notFound ? "We couldn't find that profile — pick yours below." : 'Select your profile to open your interface.'}
      </p>

      {loading ? (
        <div className="loading-state"><span className="spinner" /> Loading…</div>
      ) : error ? (
        <div className="picker-empty">Couldn't load users. Please try again.</div>
      ) : users.length === 0 ? (
        <div className="picker-empty">No users yet. An admin can add users in Settings.</div>
      ) : (
        <div className="picker-list">
          {users.map((u) => (
            <button key={u.id} className="picker-item" onClick={() => onPick(u)}>
              <span className="picker-item-name">{u.name}</span>
              {u.role === 'admin' && <span className="user-badge">Admin</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
