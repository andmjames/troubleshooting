import React, { useState } from 'react';
import Home from './components/Home';
import MachinePicker from './components/MachinePicker';
import TroubleshootChat from './components/TroubleshootChat';
import RepairLog from './components/RepairLog';
import UploadManual from './components/UploadManual';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import { LOGO_SRC } from './logo';
import './App.css';

// Views: 'home' → 'picker' → ('chat' | 'repair' | 'manual')
export default function App() {
  const [view, setView] = useState('home');
  const [mode, setMode] = useState(null);       // 'troubleshoot' | 'repair' | 'manual'
  const [machine, setMachine] = useState(null);

  const goHome = () => { setView('home'); setMode(null); setMachine(null); };
  const choose = (m) => { setMode(m); setView('picker'); };
  const pickMachine = (mc) => {
    setMachine(mc);
    setView(mode === 'repair' ? 'repair' : mode === 'manual' ? 'manual' : 'chat');
  };
  const changeMachine = () => { setMachine(null); setView('picker'); };
  const restartFlow = () => { setMachine(null); setView('picker'); };

  const pageTitle =
    view === 'home' ? 'Equipment Help'
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
              <MachinePicker mode={mode} onSelect={pickMachine} onBack={goHome} />
            )}

            {view === 'chat' && machine && (
              <TroubleshootChat machine={machine} onBack={changeMachine} />
            )}

            {view === 'repair' && machine && (
              <RepairLog machine={machine} onBack={changeMachine} onDone={restartFlow} />
            )}

            {view === 'manual' && machine && (
              <UploadManual machine={machine} onBack={goHome} onAnother={restartFlow} />
            )}
          </main>
        </div>
      </ToastProvider>
    </ErrorBoundary>
  );
}
