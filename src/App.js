import React, { useState, useEffect } from 'react';
import Home from './components/Home';
import MachinePicker from './components/MachinePicker';
import TroubleshootChat from './components/TroubleshootChat';
import RepairLog from './components/RepairLog';
import UploadManual from './components/UploadManual';
import EditMachines from './components/EditMachines';
import PreventativeMaintenance from './components/PreventativeMaintenance';
import PMEditor from './components/PMEditor';
import RepairLogManager from './components/RepairLogManager';
import ManualManager from './components/ManualManager';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import { LOGO_SRC } from './logo';
import './App.css';

// Views: 'home' → 'picker' → ('chat' | 'repair' | 'manual'), plus 'edit', 'pm', 'pmEdit'
export default function App() {
  const [view, setView] = useState('home');
  const [mode, setMode] = useState(null);          // 'troubleshoot' | 'repair' | 'manual'
  const [machine, setMachine] = useState(null);
  const [manualOrigin, setManualOrigin] = useState('home'); // 'picker' | 'edit'
  const [pmMachine, setPmMachine] = useState(null); // machine whose PM tasks are being edited
  const [logsMachine, setLogsMachine] = useState(null); // machine whose repair logs are being viewed
  const [manualsMachine, setManualsMachine] = useState(null); // machine whose manuals are being managed
  const [initialPmTask, setInitialPmTask] = useState(null);   // PM task id from a shared ?pmtask= link

  // On first load, honor a shared deep link like ?pmtask=123 by opening the PM section on that task.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('pmtask');
    if (id) { setInitialPmTask(id); setView('pm'); }
  }, []);

  const goHome = () => { setView('home'); setMode(null); setMachine(null); };

  const choose = (m) => {
    if (m === 'edit') { setView('edit'); return; }
    if (m === 'pm') { setInitialPmTask(null); setView('pm'); return; }
    setMode(m);
    setManualOrigin('picker');
    setView('picker');
  };

  const pickMachine = (mc) => {
    setMachine(mc);
    setView(mode === 'repair' ? 'repair' : mode === 'manual' ? 'manual' : 'chat');
  };

  const backToPicker = () => { setMachine(null); setView('picker'); };

  const addManualViaPicker = () => {
    setMode('manual'); setManualOrigin('edit'); setMachine(null); setView('picker');
  };
  // Upload launched from the manuals manager — return there afterward.
  const uploadManualFromManager = (mc) => {
    setMachine(mc); setMode('manual'); setManualOrigin('manuals'); setView('manual');
  };
  const manualBack = () => {
    if (manualOrigin === 'manuals') { setView('manuals'); }
    else if (manualOrigin === 'edit') { setMachine(null); setView('edit'); }
    else { goHome(); }
  };
  const manualAnother = () => {
    if (manualOrigin === 'manuals') { setView('manuals'); }
    else if (manualOrigin === 'edit') { setMachine(null); setView('edit'); }
    else { setMachine(null); setView('picker'); }
  };

  // Manuals manager (from Edit Machine modal)
  const viewManualsFor = (mc) => { setManualsMachine(mc); setView('manuals'); };

  // Preventative-maintenance task editing (from Edit Machine modal)
  const editPMFor = (mc) => { setPmMachine(mc); setView('pmEdit'); };

  // Repair log management (from Edit Machine modal)
  const viewLogsFor = (mc) => { setLogsMachine(mc); setView('repairLogs'); };

  const pageTitle =
    view === 'home' ? 'Maintenance'
    : view === 'edit' ? 'Edit Machines'
    : view === 'pm' ? 'Preventative Maintenance'
    : view === 'pmEdit' ? 'Preventative Maintenance'
    : view === 'repairLogs' ? 'Repair Log'
    : view === 'manuals' ? 'Manuals'
    : mode === 'repair' ? 'Log a Repair'
    : mode === 'manual' ? 'Add a Manual'
    : 'Troubleshooting';

  return (
    <ErrorBoundary>
      <ToastProvider>
        <div className="app">
          <header className="app-header">
            <div className="header-inner">
              <img src={LOGO_SRC} alt="PMI Tape" className="header-logo" />
              <span className="header-divider" />
              <span className="header-page-title">{pageTitle}</span>
            </div>
          </header>

          <main className="app-main">
            {view === 'home' && <Home onChoose={choose} />}

            {view === 'picker' && (
              <MachinePicker
                mode={mode}
                onSelect={pickMachine}
                onBack={mode === 'manual' && manualOrigin === 'edit' ? () => setView('edit') : goHome}
              />
            )}

            {view === 'chat' && machine && (
              <TroubleshootChat machine={machine} onBack={backToPicker} />
            )}

            {view === 'repair' && machine && (
              <RepairLog machine={machine} onBack={backToPicker} onDone={backToPicker} />
            )}

            {view === 'manual' && machine && (
              <UploadManual machine={machine} onBack={manualBack} onAnother={manualAnother} />
            )}

            {view === 'edit' && (
              <EditMachines
                onBack={goHome}
                onAddManualViaPicker={addManualViaPicker}
                onEditPM={editPMFor}
                onViewLogs={viewLogsFor}
                onViewManuals={viewManualsFor}
              />
            )}

            {view === 'pm' && <PreventativeMaintenance onBack={goHome} initialTaskId={initialPmTask} />}

            {view === 'pmEdit' && pmMachine && (
              <PMEditor machine={pmMachine} onBack={() => setView('edit')} />
            )}

            {view === 'repairLogs' && logsMachine && (
              <RepairLogManager machine={logsMachine} onBack={() => setView('edit')} />
            )}

            {view === 'manuals' && manualsMachine && (
              <ManualManager machine={manualsMachine} onBack={() => setView('edit')} onUpload={uploadManualFromManager} />
            )}
          </main>
        </div>
      </ToastProvider>
    </ErrorBoundary>
  );
}
