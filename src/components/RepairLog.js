import React, { useRef, useState } from 'react';
import { IconPlus } from '../lib/icons';
import { uploadRepairPhoto, saveRepairLogMulti } from '../lib/supabase';
import { useToast } from './Toast';

function PhotoStrip({ photos, onAdd, onRemove, busy }) {
  const inputRef = useRef(null);
  return (
    <>
      <div className="photo-strip">
        {photos.map((p, i) => (
          <div key={i} className="photo-tile">
            <img src={p.preview} alt="" />
            <button type="button" className="photo-remove" onClick={() => onRemove(i)} aria-label="Remove photo">×</button>
          </div>
        ))}
        <button type="button" className="photo-add" onClick={() => inputRef.current?.click()} disabled={busy}>
          <IconPlus /> Add photo
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => { onAdd(Array.from(e.target.files || [])); e.target.value = ''; }}
      />
    </>
  );
}

export default function RepairLog({ machine, onBack, onDone, userName, onViewLogs, multiMachine, availableMachines = [] }) {
  const [problem, setProblem] = useState('');
  const [solution, setSolution] = useState('');
  const [details, setDetails] = useState('');
  const [andrewInput, setAndrewInput] = useState(null);      // 'yes' | 'no' — required for Ryan Small only
  const [machines, setMachines] = useState([machine]);       // machines this solution applies to
  const [pickingMachine, setPickingMachine] = useState(false);

  // Only Ryan Small is asked whether the repair required Andrew J's input.
  const asksAndrew = (userName || '').trim().toLowerCase() === 'ryan small';
  const [problemPhotos, setProblemPhotos] = useState([]);   // {file, preview}
  const [solutionPhotos, setSolutionPhotos] = useState([]);
  const [intake, setIntake] = useState([]);                  // AI follow-up questions
  const [intakeAsked, setIntakeAsked] = useState(false);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const toast = useToast();

  const addPhotos = (setter) => (files) => {
    const next = files.map((f) => ({ file: f, preview: URL.createObjectURL(f) }));
    setter((prev) => [...prev, ...next]);
  };
  const removePhoto = (setter) => (idx) =>
    setter((prev) => prev.filter((_, i) => i !== idx));

  // Ask Claude whether it needs more detail before saving (capped, runs once).
  const checkDetails = async () => {
    if (!problem.trim() || !solution.trim()) {
      toast('Add the problem and the solution first', 'error');
      return;
    }
    if (asksAndrew && !andrewInput) {
      toast('Select whether this required input from Andrew J', 'error');
      return;
    }
    setChecking(true);
    try {
      const res = await fetch('/.netlify/functions/repair-intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          machineName: machine.name,
          problem, solution, details,
        }),
      });
      if (!res.ok) throw new Error(`Server error (${res.status})`);
      const data = await res.json();
      setIntake(data.questions || []);
      setIntakeAsked(true);
      if (!data.questions || data.questions.length === 0) {
        // Nothing more needed — save straight away.
        await doSave();
      }
    } catch (e) {
      // If intake fails, don't block the user — let them save anyway.
      toast('Skipping detail check — you can save now', 'error');
      setIntakeAsked(true);
    } finally {
      setChecking(false);
    }
  };

  const uploadAll = async (photos) => {
    const out = [];
    for (const p of photos) {
      const path = await uploadRepairPhoto(p.file);
      out.push({ path, caption: '' });
    }
    return out;
  };

  const selectedIds = new Set(machines.map((m) => Number(m.id)));
  const addableMachines = (availableMachines || []).filter((m) => !selectedIds.has(Number(m.id)));
  const addMachine = (m) => { setMachines((prev) => [...prev, m]); setPickingMachine(false); };
  const removeMachine = (id) => setMachines((prev) => (prev.length > 1 ? prev.filter((m) => Number(m.id) !== Number(id)) : prev));

  const doSave = async () => {
    setSaving(true);
    try {
      const [pPhotos, sPhotos] = await Promise.all([
        uploadAll(problemPhotos),
        uploadAll(solutionPhotos),
      ]);
      await saveRepairLogMulti({
        machines,
        problem: problem.trim(),
        solution: solution.trim(),
        details: details.trim() || null,
        technician: (userName || '').trim() || null,
        required_andrew_input: asksAndrew ? (andrewInput === 'yes') : null,
        problem_photos: pPhotos,
        solution_photos: sPhotos,
      });
      setSaved(true);
      toast(machines.length > 1 ? `Repair logged for ${machines.length} machines` : 'Repair logged', 'success');
    } catch (e) {
      toast(e.message || 'Could not save the repair', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    return (
      <div className="repair-wrap">
        <div className="repair-success">
          <div className="repair-success-icon">✓</div>
          <h2 className="picker-title" style={{ textAlign: 'center' }}>Repair logged</h2>
          <p className="picker-sub" style={{ textAlign: 'center' }}>
            {machines.length > 1
              ? `This is now searchable when troubleshooting any of: ${machines.map((m) => m.name).join(', ')}.`
              : `This is now searchable the next time someone troubleshoots the ${machine.name}.`}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 8 }}>
            <button className="btn" onClick={onDone}>Log another</button>
            <button className="btn btn-primary" onClick={onBack}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  const busy = checking || saving;

  return (
    <div className="repair-wrap">
      <div className="repair-context-bar">
        <span style={{ flex: 1 }}>Logging a solution for <span className="repair-context-machine">{machine.name}</span></span>
        {onViewLogs && <button className="btn btn-ghost btn-sm" onClick={onViewLogs}>View/Edit Log Entries</button>}
        {multiMachine && <button className="btn btn-ghost btn-sm" onClick={onBack}>Change machine</button>}
      </div>

      <div className="section">
        <div className="section-header">
          <span className="section-title"><span className="section-title-dot" /> Machines this solution applies to</span>
        </div>
        <div className="section-body">
          <div className="machine-chips">
            {machines.map((m) => (
              <span key={m.id} className="machine-chip">
                {m.name}
                {machines.length > 1 && (
                  <button className="machine-chip-x" onClick={() => removeMachine(m.id)} aria-label={`Remove ${m.name}`}>×</button>
                )}
              </span>
            ))}
          </div>
          {addableMachines.length > 0 && (
            pickingMachine ? (
              <div className="machine-add-list">
                {addableMachines.map((m) => (
                  <button key={m.id} className="machine-add-item" onClick={() => addMachine(m)}>+ {m.name}</button>
                ))}
                <button className="text-link" onClick={() => setPickingMachine(false)}>Cancel</button>
              </div>
            ) : (
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setPickingMachine(true)}>
                + Add another machine to this solution
              </button>
            )
          )}
          {machines.length > 1 && (
            <p className="perm-subhint">This same solution will be logged for all {machines.length} machines.</p>
          )}
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <span className="section-title"><span className="section-title-dot" /> The Problem</span>
        </div>
        <div className="section-body">
          <div className="field-group">
            <label className="field-label">What was wrong?</label>
            <textarea
              className="repair-textarea"
              placeholder="Describe the symptoms — what the machine was doing, error codes, sounds, when it started…"
              value={problem}
              onChange={(e) => setProblem(e.target.value)}
            />
          </div>
          <label className="field-label" style={{ marginTop: 14, display: 'block' }}>Photos of the problem</label>
          <PhotoStrip photos={problemPhotos} onAdd={addPhotos(setProblemPhotos)} onRemove={removePhoto(setProblemPhotos)} busy={busy} />
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <span className="section-title"><span className="section-title-dot" /> The Solution</span>
        </div>
        <div className="section-body">
          <div className="field-group">
            <label className="field-label">How did you fix it?</label>
            <textarea
              className="repair-textarea"
              placeholder="Describe what you did to fix it — parts replaced, adjustments made, settings changed…"
              value={solution}
              onChange={(e) => setSolution(e.target.value)}
            />
          </div>
          <label className="field-label" style={{ marginTop: 14, display: 'block' }}>Photos of the fix (optional)</label>
          <PhotoStrip photos={solutionPhotos} onAdd={addPhotos(setSolutionPhotos)} onRemove={removePhoto(setSolutionPhotos)} busy={busy} />

          {asksAndrew && (
            <div className="field-group" style={{ marginTop: 14 }}>
              <label className="field-label">Did this repair require input from Andrew J? <span className="field-req">*</span></label>
              <div className="radio-row">
                <label className="radio-opt">
                  <input type="radio" name="andrewInput" checked={andrewInput === 'yes'} onChange={() => setAndrewInput('yes')} />
                  <span>Yes</span>
                </label>
                <label className="radio-opt">
                  <input type="radio" name="andrewInput" checked={andrewInput === 'no'} onChange={() => setAndrewInput('no')} />
                  <span>No</span>
                </label>
              </div>
            </div>
          )}
        </div>
      </div>

      {intakeAsked && intake.length > 0 && (
        <div className="section">
          <div className="section-body" style={{ paddingTop: '1.25rem' }}>
            <div className="intake-box">
              <div className="intake-label">A few more details would help future searches</div>
              {intake.map((q, i) => <div key={i} className="intake-q">• {q}</div>)}
            </div>
            <div className="field-group" style={{ marginTop: 14 }}>
              <label className="field-label">Add any of those details here (optional)</label>
              <textarea
                className="repair-textarea"
                placeholder="Answer whichever are relevant…"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
        <button className="btn btn-ghost" onClick={onBack} disabled={busy}>Cancel</button>
        {!intakeAsked ? (
          <button className="btn btn-primary" onClick={checkDetails} disabled={busy || !problem.trim() || !solution.trim() || (asksAndrew && !andrewInput)}>
            {checking ? <><span className="spinner" /> Reviewing…</> : 'Review & save'}
          </button>
        ) : (
          <button className="btn btn-primary" onClick={doSave} disabled={busy}>
            {saving ? <><span className="spinner" /> Saving…</> : 'Save repair'}
          </button>
        )}
      </div>
    </div>
  );
}
