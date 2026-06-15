import React, { useState } from 'react';
import Home from './components/Home';
import MachinePicker from './components/MachinePicker';
import TroubleshootChat from './components/TroubleshootChat';
import RepairLog from './components/RepairLog';
import UploadManual from './components/UploadManual';
import EditMachines from './components/EditMachines';
import PreventativeMaintenance from './components/PreventativeMaintenance';
import PMEditor from './components/PMEditor';
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

  const goHome = () => { setView('home'); setMode(null); setMachine(null); };

  const choose = (m) => {
    if (m === 'edit') { setView('edit'); return; }
    if (m === 'pm') { setView('pm'); return; }
    setMode(m);
    setManualOrigin('picker');
    setView('picker');
  };

  const pickMachine = (mc) => {
    setMachine(mc);
    setView(mode === 'repair' ? 'repair' : mode === 'manual' ? 'manual' : 'chat');
  };

  const backToPicker = () => { setMachine(null); setView('picker'); };

  const addManualFor = (mc) => {
    setMachine(mc); setMode('manual'); setManualOrigin('edit'); setView('manual');
  };
  const addManualViaPicker = () => {
    setMode('manual'); setManualOrigin('edit'); setMachine(null); setView('picker');
  };
  const manualBack = () => {
    if (manualOrigin === 'edit') { setMachine(null); setView('edit'); } else { goHome(); }
  };
  const manualAnother = () => {
    if (manualOrigin === 'edit') { setMachine(null); setView('edit'); }
    else { setMachine(null); setView('picker'); }
  };

  // Preventative-maintenance task editing (from Edit Machine modal)
  const editPMFor = (mc) => { setPmMachine(mc); setView('pmEdit'); };

  const pageTitle =
    view === 'home' ? 'Maintenance'
    : view === 'edit' ? 'Edit Machines'
    : view === 'pm' ? 'Preventative Maintenance'
    : view === 'pmEdit' ? 'Preventative Maintenance'
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
                onAddManual={addManualFor}
                onAddManualViaPicker={addManualViaPicker}
                onEditPM={editPMFor}
              />
            )}

            {view === 'pm' && <PreventativeMaintenance onBack={goHome} />}

            {view === 'pmEdit' && pmMachine && (
              <PMEditor machine={pmMachine} onBack={() => setView('edit')} />
            )}
          </main>
        </div>
      </ToastProvider>
    </ErrorBoundary>
  );
}
