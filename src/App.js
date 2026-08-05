import React, { useState, useEffect, useRef } from 'react';
import Home from './components/Home';
import MachinePicker from './components/MachinePicker';
import TroubleshootChat from './components/TroubleshootChat';
import RepairLog from './components/RepairLog';
import UploadManual from './components/UploadManual';
import EditMachines from './components/EditMachines';
import Settings from './components/Settings';
import PreventativeMaintenance from './components/PreventativeMaintenance';
import PMEditor from './components/PMEditor';
import RepairLogManager from './components/RepairLogManager';
import ManualManager from './components/ManualManager';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import { fetchUsers } from './lib/supabase';
import { hasPermission, slugify } from './lib/permissions';
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

  // Identity-by-URL: the path (/andrew-james) selects whose permission-scoped
  // interface to show. No path → a profile picker. This is NOT authentication —
  // anyone with a URL, or who picks a name, gets that interface.
  const [currentUser, setCurrentUser] = useState(null);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [userNotFound, setUserNotFound] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchUsers().then((us) => {
      if (!alive) return;
      const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
      if (path) {
        const u = us.find((x) => slugify(x.name) === path || String(x.id) === path) || null;
        if (u) setCurrentUser(u); else setUserNotFound(true);
      }
      setUsersLoaded(true);
    }).catch(() => setUsersLoaded(true));
    return () => { alive = false; };
  }, []);

  // Honor a shared deep link like ?pmtask=123 once we know who the user is — but
  // only if they can access Preventative maintenance. Works whether the user was
  // identified from the URL or picked from the profile screen.
  const pmHandled = useRef(false);
  useEffect(() => {
    if (pmHandled.current || !currentUser) return;
    const pmId = new URLSearchParams(window.location.search).get('pmtask');
    if (pmId && hasPermission(currentUser, 'preventative_maintenance')) {
      setInitialPmTask(pmId);
      setView('pm');
    }
    pmHandled.current = true;
  }, [currentUser]);

  const can = (key) => hasPermission(currentUser, key);

  const goHome = () => { setView('home'); setMode(null); setMachine(null); };

  const choose = (m) => {
    if (m === 'edit') { setView('edit'); return; }
    if (m === 'settings') { setView('settings'); return; }
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
    view === 'home' ? 'Troubleshooting'
    : view === 'edit' ? 'Edit Machines'
    : view === 'settings' ? 'Settings'
    : view === 'pm' ? 'Preventative Maintenance'
    : view === 'pmEdit' ? 'Preventative Maintenance'
    : view === 'repairLogs' ? 'Repair Log'
    : view === 'repairLogsAll' ? 'Repair Logs'
    : view === 'manuals' ? 'Manuals'
    : mode === 'repair' ? 'Log a Solution'
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
            {!usersLoaded ? (
              <div className="loading-state" style={{ marginTop: 40 }}><span className="spinner" /> Loading…</div>
            ) : !currentUser ? (
              <div className="picker-wrap">
                <div className="picker-eyebrow">PMI Tape · Troubleshooting</div>
                <h1 className="picker-title">Access by personal link</h1>
                <p className="picker-sub">
                  {userNotFound
                    ? "That link isn't recognized. Please open the app using your personal link."
                    : 'This app is opened through your personal link. Please use the URL assigned to you.'}
                </p>
                <p className="picker-sub" style={{ marginTop: 4 }}>
                  Don't have your link? Ask an admin — each user's link is in Settings.
                </p>
              </div>
            ) : (
            <>
            {view === 'home' && <Home onChoose={choose} can={can} userName={currentUser.name} />}

            {view === 'picker' && (
              <MachinePicker
                mode={mode}
                onSelect={pickMachine}
                onBack={goHome}
                actionLabel={mode === 'repair' ? 'View/Edit Repair Log Entries' : undefined}
                onAction={mode === 'repair' ? () => setView('repairLogsAll') : undefined}
              />
            )}

            {view === 'chat' && machine && (
              <TroubleshootChat machine={machine} onClose={goHome} />
            )}

            {view === 'repair' && machine && (
              <RepairLog machine={machine} onBack={backToPicker} onDone={backToPicker} />
            )}

            {view === 'manual' && machine && (
              <UploadManual machine={machine} onBack={manualBack} onAnother={manualAnother} />
            )}

            {view === 'settings' && <Settings onBack={goHome} />}

            {view === 'edit' && (
              <EditMachines
                onBack={goHome}
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

            {view === 'repairLogsAll' && (
              <RepairLogManager allMachines canAnalytics={can('analytics')} onBack={() => setView('picker')} />
            )}

            {view === 'manuals' && manualsMachine && (
              <ManualManager machine={manualsMachine} onBack={() => setView('edit')} onUpload={uploadManualFromManager} />
            )}
            </>
            )}
          </main>
        </div>
      </ToastProvider>
    </ErrorBoundary>
  );
}
