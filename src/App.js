import React, { useState, useEffect, useMemo } from 'react';
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
import { fetchUsers, fetchMachines } from './lib/supabase';
import { hasPermission, userSlug } from './lib/permissions';
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
    // Support "Add to Home Screen": remember which user's URL this is, and if the
    // app is later launched standalone straight to the root (some iOS versions
    // drop the path), send it back to the last user URL.
    try {
      const p = window.location.pathname.replace(/^\/+|\/+$/g, '');
      const standalone = window.navigator.standalone === true
        || window.matchMedia('(display-mode: standalone)').matches;
      if (p && !window.location.search.includes('pmtask')) {
        localStorage.setItem('et_home_path', '/' + p);
      } else if (!p && standalone) {
        const saved = localStorage.getItem('et_home_path');
        if (saved && saved !== '/') { window.location.replace(saved); }
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    let alive = true;
    fetchUsers().then((us) => {
      if (!alive) return;
      const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
      if (path) {
        const u = us.find((x) => userSlug(x) === path || String(x.id) === path) || null;
        if (u) setCurrentUser(u); else setUserNotFound(true);
      }
      setUsersLoaded(true);
    }).catch(() => setUsersLoaded(true));
    return () => { alive = false; };
  }, []);

  // A shared ?pmtask=123 link is universal: anyone can open it, no profile or
  // permission required, and it shows ONLY that task (locked, no navigation).
  const [lockedPmTaskId] = useState(() => new URLSearchParams(window.location.search).get('pmtask'));

  const can = (key) => hasPermission(currentUser, key);

  // The machines this user may work on. Empty machine_ids = all machines.
  const [allMachines, setAllMachines] = useState([]);
  const [machinesLoaded, setMachinesLoaded] = useState(false);
  useEffect(() => {
    if (!currentUser) return undefined;
    let alive = true;
    fetchMachines()
      .then((ms) => { if (alive) { setAllMachines(ms); setMachinesLoaded(true); } })
      .catch(() => { if (alive) setMachinesLoaded(true); });
    return () => { alive = false; };
  }, [currentUser]);

  const allowedMachines = useMemo(() => {
    const ids = (currentUser && Array.isArray(currentUser.machine_ids)) ? currentUser.machine_ids : [];
    if (!ids.length) return allMachines;                 // no restriction = all
    const set = new Set(ids.map(Number));
    return allMachines.filter((m) => set.has(Number(m.id)));
  }, [allMachines, currentUser]);

  const goHome = () => { setView('home'); setMode(null); setMachine(null); };

  const choose = (m) => {
    if (m === 'edit') { setView('edit'); return; }
    if (m === 'settings') { setView('settings'); return; }
    if (m === 'analytics') { setView('analytics'); return; }
    if (m === 'pm') { setInitialPmTask(null); setView('pm'); return; }
    setMode(m);
    setManualOrigin('picker');
    // If the user has exactly one machine, skip the picker and go straight to it.
    if (machinesLoaded && allowedMachines.length === 1) {
      setMachine(allowedMachines[0]);
      setView(m === 'repair' ? 'repair' : 'chat');
      return;
    }
    setView('picker');
  };

  const pickMachine = (mc) => {
    setMachine(mc);
    setView(mode === 'repair' ? 'repair' : mode === 'manual' ? 'manual' : 'chat');
  };

  const backToPicker = () => {
    setMachine(null);
    if (machinesLoaded && allowedMachines.length === 1) { setMode(null); setView('home'); }
    else setView('picker');
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
    lockedPmTaskId ? 'Preventative Maintenance'
    : view === 'home' ? 'Troubleshooting'
    : view === 'edit' ? 'Edit Machines'
    : view === 'settings' ? 'Settings'
    : view === 'analytics' ? 'Analytics'
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
            {lockedPmTaskId ? (
              <PreventativeMaintenance initialTaskId={lockedPmTaskId} locked />
            ) : !usersLoaded ? (
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
            {view === 'home' && (
              <Home
                onChoose={choose}
                can={can}
                userName={currentUser.name}
                soloMachine={machinesLoaded && allowedMachines.length === 1 ? allowedMachines[0].name : null}
              />
            )}

            {view === 'picker' && (
              <MachinePicker
                mode={mode}
                onSelect={pickMachine}
                onBack={goHome}
                machines={allowedMachines}
                loading={!machinesLoaded}
                actionLabel={mode === 'repair' ? 'View/Edit Log Entries' : undefined}
                onAction={mode === 'repair' ? () => setView('repairLogsAll') : undefined}
              />
            )}

            {view === 'chat' && machine && (
              <TroubleshootChat machine={machine} onClose={goHome} />
            )}

            {view === 'repair' && machine && (
              <RepairLog
                machine={machine}
                onBack={backToPicker}
                onDone={backToPicker}
                userName={currentUser.name}
                onViewLogs={() => setView('repairLogsAll')}
                multiMachine={machinesLoaded && allowedMachines.length > 1}
                availableMachines={allowedMachines}
              />
            )}

            {view === 'manual' && machine && (
              <UploadManual machine={machine} onBack={manualBack} onAnother={manualAnother} />
            )}

            {view === 'settings' && <Settings onBack={goHome} />}

            {view === 'analytics' && (
              <RepairLogManager allMachines analyticsOnly machineFilter={currentUser.machine_ids} isMaintenance={!!currentUser.maintenance} onBack={goHome} />
            )}

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
              <RepairLogManager machine={logsMachine} isMaintenance={!!currentUser.maintenance} onBack={() => setView('edit')} />
            )}

            {view === 'repairLogsAll' && (
              <RepairLogManager
                allMachines
                machineFilter={currentUser.machine_ids}
                isMaintenance={!!currentUser.maintenance}
                onBack={() => setView(machine ? 'repair' : 'picker')}
              />
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
