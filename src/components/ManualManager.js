import React, { useEffect, useState, useCallback } from 'react';
import { fetchManualsForMachine, removeManual, viewManual, reprocessManual } from '../lib/supabase';
import { useToast } from './Toast';

function statusLabel(m) {
  if (m.status === 'ready') return `${m.page_count || 0} pages`;
  if (m.status === 'processing') return m.page_count ? `processing ${m.pages_done || 0}/${m.page_count}` : 'processing…';
  if (m.status === 'pending') return 'queued…';
  if (m.status === 'error') return 'failed';
  return m.status || '';
}

export default function ManualManager({ machine, onBack, onUpload }) {
  const [manuals, setManuals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmDel, setConfirmDel] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [opening, setOpening] = useState(null);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setManuals(await fetchManualsForMachine(machine.id));
    } catch (e) {
      toast(e.message || 'Could not load manuals', 'error');
    } finally {
      setLoading(false);
    }
  }, [machine.id, toast]);

  useEffect(() => { load(); }, [load]);

  const view = async (m) => {
    setOpening(m.id);
    try {
      const url = await viewManual(m);
      if (!url) toast('Could not open this manual', 'error');
    } catch (e) {
      toast(e.message || 'Could not open this manual', 'error');
    } finally {
      setOpening(null);
    }
  };

  const retry = async (m) => {
    try {
      await reprocessManual(m.id);
      toast('Re-processing started', 'success');
      await load();
    } catch (e) {
      toast(e.message || 'Could not restart processing', 'error');
    }
  };

  const doDelete = async () => {
    if (!confirmDel) return;
    setRemoving(true);
    try {
      await removeManual(confirmDel);
      toast('Manual deleted', 'success');
      setConfirmDel(null);
      await load();
    } catch (e) {
      toast(e.message || 'Could not delete manual', 'error');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="repair-wrap">
      <button className="back-link" onClick={onBack} style={{ marginBottom: 12 }}>← Edit Machines</button>

      <div className="repair-context-bar">
        Manuals for <span className="repair-context-machine">{machine.name}</span>
      </div>

      <div className="edit-actions-bar">
        <span className="edit-actions-label">Manuals{manuals.length ? ` (${manuals.length})` : ''}</span>
        <button className="btn btn-sm btn-primary" onClick={() => onUpload(machine)}>Upload manual</button>
      </div>

      <div className="section">
        <div className="section-body" style={{ paddingTop: '0.5rem', paddingBottom: '0.5rem' }}>
          {loading ? (
            <div className="loading-state"><span className="spinner" /> Loading…</div>
          ) : manuals.length === 0 ? (
            <div className="picker-empty">No manuals uploaded for this machine yet.</div>
          ) : (
            <div className="machine-edit-list">
              {manuals.map((m) => (
                <div key={m.id} className="machine-edit-row">
                  <div className="machine-edit-info">
                    <div className="machine-edit-name">{m.title}</div>
                    <div className="machine-edit-meta">{statusLabel(m)}</div>
                  </div>
                  <div className="machine-edit-actions">
                    <button className="btn btn-sm" onClick={() => view(m)} disabled={!m.storage_path || opening === m.id}>
                      {opening === m.id ? <><span className="spinner" /> Opening…</> : 'View'}
                    </button>
                    {m.status !== 'ready' && m.status !== 'processing' && (
                      <button className="btn btn-sm" onClick={() => retry(m)}>Retry</button>
                    )}
                    <button className="btn btn-sm btn-danger" onClick={() => setConfirmDel(m)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {confirmDel && (
        <div className="modal-overlay" onClick={() => !removing && setConfirmDel(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Delete this manual?</span>
              <button className="modal-close" onClick={() => !removing && setConfirmDel(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14, lineHeight: 1.6 }}>
                This removes “{confirmDel.title}” and its searchable pages from troubleshooting. This can't be undone.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setConfirmDel(null)} disabled={removing}>Cancel</button>
              <button className="btn btn-danger" onClick={doDelete} disabled={removing}>
                {removing ? <><span className="spinner" /> Deleting…</> : 'Delete manual'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
