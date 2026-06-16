import React, { useEffect, useRef, useState } from 'react';
import { uploadManual, pollManual, fetchManualsForMachine } from '../lib/supabase';
import { useToast } from './Toast';

function statusLabel(m) {
  if (m.status === 'ready') return `${m.page_count || 0} pages`;
  if (m.status === 'processing') return m.page_count
    ? `processing ${m.pages_done || 0}/${m.page_count}`
    : 'processing…';
  if (m.status === 'pending') return 'queued…';
  if (m.status === 'error') return 'failed';
  return m.status;
}

export default function UploadManual({ machine, onBack, onAnother }) {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [drag, setDrag] = useState(false);
  const [phase, setPhase] = useState('idle');     // idle | uploading | processing | done | error
  const [progress, setProgress] = useState({ pageCount: 0, pagesDone: 0 });
  const [existing, setExisting] = useState(null);  // null = loading
  const inputRef = useRef(null);
  const toast = useToast();

  // Load the manuals this machine already has, so it's clear you're adding to a set.
  useEffect(() => {
    let alive = true;
    fetchManualsForMachine(machine.id)
      .then((list) => { if (alive) setExisting(list); })
      .catch(() => { if (alive) setExisting([]); });
    return () => { alive = false; };
  }, [machine.id, phase]); // refetch after a successful add (phase -> done)

  const pickFile = (f) => {
    if (!f) return;
    if (f.type !== 'application/pdf' && !/\.pdf$/i.test(f.name)) {
      toast('Please choose a PDF file', 'error');
      return;
    }
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.pdf$/i, ''));
  };

  const onDrop = (e) => {
    e.preventDefault(); setDrag(false);
    pickFile(e.dataTransfer.files?.[0]);
  };

  const start = async () => {
    if (!file) return;
    setPhase('uploading');
    try {
      const manualId = await uploadManual({
        machineId: machine.id,
        title: title.trim(),
        file,
        onProgress: () => setPhase('processing'),
      });
      setPhase('processing');
      await pollManual(manualId, (u) => setProgress({ pageCount: u.pageCount, pagesDone: u.pagesDone }));
      setPhase('done');
      toast('Manual added', 'success');
    } catch (e) {
      setPhase('error');
      toast(e.message || 'Upload failed', 'error');
    }
  };

  // Reset the form to add another manual to the SAME machine.
  const addAnotherHere = () => {
    setFile(null);
    setTitle('');
    setProgress({ pageCount: 0, pagesDone: 0 });
    setPhase('idle');
  };

  const pct = progress.pageCount
    ? Math.round((progress.pagesDone / progress.pageCount) * 100)
    : 0;

  if (phase === 'done') {
    return (
      <div className="repair-wrap">
        <div className="repair-success">
          <div className="repair-success-icon">✓</div>
          <h2 className="picker-title" style={{ textAlign: 'center' }}>Manual added</h2>
          <p className="picker-sub" style={{ textAlign: 'center' }}>
            {progress.pageCount} pages from “{title}” are now searchable for the {machine.name},
            with page images the troubleshooter can show.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={addAnotherHere}>Add another for {machine.name}</button>
            <button className="btn" onClick={onAnother}>Different machine</button>
            <button className="btn btn-ghost" onClick={onBack}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  const working = phase === 'uploading' || phase === 'processing';

  return (
    <div className="repair-wrap">
      <button className="back-link" onClick={onBack} style={{ marginBottom: 12 }}>← Back</button>
      <div className="repair-context-bar">
        Adding a manual for <span className="repair-context-machine">{machine.name}</span>
      </div>

      {/* Existing manuals for this machine — confirms you're adding to a set */}
      {existing && existing.length > 0 && (
        <div className="section">
          <div className="section-header">
            <span className="section-title">
              <span className="section-title-dot" /> Already on this machine ({existing.length})
            </span>
          </div>
          <div className="section-body" style={{ paddingTop: '0.75rem', paddingBottom: '0.75rem' }}>
            <div className="manual-list">
              {existing.map((m) => (
                <div key={m.id} className="manual-list-row">
                  <span className="manual-list-title">{m.title}</span>
                  <span className={`badge ${m.status === 'ready' ? 'badge-green' : m.status === 'error' ? 'badge-gray' : 'badge-blue'}`}>
                    {statusLabel(m)}
                  </span>
                </div>
              ))}
            </div>
            <p className="manual-list-hint">
              Adding another PDF here adds to this set — useful when a manual comes in several
              parts (operation, parts, electrical). The troubleshooter searches all of them together.
            </p>
          </div>
        </div>
      )}

      <div className="section">
        <div className="section-header">
          <span className="section-title">
            <span className="section-title-dot" />
            {existing && existing.length > 0 ? 'Add another PDF' : 'Manual PDF'}
          </span>
        </div>
        <div className="section-body">
          {!working ? (
            <>
              <div
                className={`dropzone ${drag ? 'drag' : ''}`}
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={onDrop}
              >
                <div className="dropzone-title">{file ? file.name : 'Drop a PDF here, or tap to choose'}</div>
                <div className="dropzone-sub">
                  {file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : 'One PDF at a time · add as many as the machine needs'}
                </div>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf"
                style={{ display: 'none' }}
                onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ''; }}
              />

              {file && (
                <div className="field-group" style={{ marginTop: 16 }}>
                  <label className="field-label">Title — name this part so you can tell them apart</label>
                  <input className="field-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Parts Manual, or Electrical Schematics" />
                </div>
              )}
            </>
          ) : (
            <div style={{ padding: '1rem 0' }}>
              <div className="chat-thinking" style={{ marginBottom: 12 }}>
                <span className="spinner" />
                {phase === 'uploading'
                  ? 'Uploading the PDF…'
                  : progress.pageCount
                    ? `Reading pages — ${progress.pagesDone} of ${progress.pageCount}`
                    : 'Reading the manual…'}
              </div>
              <div style={{ height: 8, background: 'var(--bg2)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${phase === 'uploading' ? 6 : Math.max(pct, 4)}%`,
                  background: 'var(--text)',
                  transition: 'width .4s ease',
                }} />
              </div>
              <p className="picker-sub" style={{ marginTop: 12, marginBottom: 0 }}>
                This runs in the background — it's fine to leave this screen, the manual keeps processing.
              </p>
            </div>
          )}
        </div>
      </div>

      {!working && (
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
          <button className="btn btn-ghost" onClick={onBack}>Cancel</button>
          <button className="btn btn-primary" onClick={start} disabled={!file}>Add manual</button>
        </div>
      )}
    </div>
  );
}
