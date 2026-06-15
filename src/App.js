import React, { useState } from 'react';
import Home from './components/Home';
import MachinePicker from './components/MachinePicker';
import TroubleshootChat from './components/TroubleshootChat';
import RepairLog from './components/RepairLog';
import UploadManual from './components/UploadManual';
import EditMachines from './components/EditMachines';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import { LOGO_SRC } from './logo';
import './App.css';

// Views: 'home' → 'picker' → ('chat' | 'repair' | 'manual'), plus 'edit'
export default function App() {
  const [view, setView] = useState('home');
  const [mode, setMode] = useState(null);          // 'troubleshoot' | 'repair' | 'manual'
  const [machine, setMachine] = useState(null);
  const [manualOrigin, setManualOrigin] = useState('home'); // 'picker' | 'edit'

  const goHome = () => { setView('home'); setMode(null); setMachine(null); };

  const choose = (m) => {
    if (m === 'edit') { setView('edit'); return; }
    setMode(m);
    setManualOrigin('picker');
    setView('picker');
  };

  const pickMachine = (mc) => {
    setMachine(mc);
    setView(mode === 'repair' ? 'repair' : mode === 'manual' ? 'manual' : 'chat');
  };

  // Picker-flow "change machine" / "add another for a different machine"
  const backToPicker = () => { setMachine(null); setView('picker'); };

  // Launch the manual uploader for a specific machine from the editor.
  const addManualFor = (mc) => {
    setMachine(mc);
    setMode('manual');
    setManualOrigin('edit');
    setView('manual');
  };

  // From the editor: "Add a manual" with machine selection on the next screen.
  const addManualViaPicker = () => {
    setMode('manual');
    setManualOrigin('edit');
    setMachine(null);
    setView('picker');
  };

  // Where the manual uploader returns to depends on how it was opened.
  const manualBack = () => {
    if (manualOrigin === 'edit') { setMachine(null); setView('edit'); }
    else { goHome(); }
  };
  const manualAnother = () => {
    if (manualOrigin === 'edit') { setMachine(null); setView('edit'); }
    else { setMachine(null); setView('picker'); }
  };

  const pageTitle =
    view === 'home' ? 'Equipment Troubleshooting'
    : view === 'edit' ? 'Edit Machines'
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
              <EditMachines onBack={goHome} onAddManual={addManualFor} onAddManualViaPicker={addManualViaPicker} />
            )}
          </main>
        </div>
      </ToastProvider>
    </ErrorBoundary>
  );
}
