import React from 'react';
import { IconChat, IconWrench, IconCalendar, IconChecklist } from '../lib/icons';

export default function Home({ onChoose, can = () => true, userName, soloMachine, showTodo = false }) {
  // Troubleshooting + Log a solution are always shown; PM is gated; the To Do list
  // shows for admins and maintenance users. (Analytics is a footer link, not a tile.)
  const tileCount = 2 + (can('preventative_maintenance') ? 1 : 0) + (showTodo ? 1 : 0);
  return (
    <div className="home-wrap">
      <div className="home-eyebrow">PMI Tape · {userName || 'Troubleshooting'}</div>
      <h1 className="home-title">{soloMachine ? `${soloMachine} Troubleshooting` : 'Equipment Troubleshooting'}</h1>

      <div className={`home-cards ${tileCount === 4 ? 'home-cards-4' : 'home-cards-3'}`}>
        <button className="home-card" onClick={() => onChoose('troubleshoot')}>
          <span className="home-card-icon"><IconChat /></span>
          <span className="home-card-title">Help me with troubleshooting</span>
          <span className="home-card-desc">
            Describe what's wrong and get answers based on past repairs, the
            manuals, and the web.
          </span>
        </button>

        <button className="home-card" onClick={() => onChoose('repair')}>
          <span className="home-card-icon"><IconWrench /></span>
          <span className="home-card-title">Log a solution</span>
          <span className="home-card-desc">
            Record a problem and how you fixed it, with photos, so it's there next
            time something similar happens.
          </span>
        </button>

        {can('preventative_maintenance') && (
          <button className="home-card" onClick={() => onChoose('pm')}>
            <span className="home-card-icon"><IconCalendar /></span>
            <span className="home-card-title">Preventative maintenance</span>
            <span className="home-card-desc">
              See what's due, work through a machine's checklist, and log completed
              maintenance.
            </span>
          </button>
        )}

        {showTodo && (
          <button className="home-card home-card-todo" onClick={() => onChoose('todo')}>
            <span className="home-card-icon"><IconChecklist /></span>
            <span className="home-card-title">Work Orders</span>
            <span className="home-card-desc">
              Shared work orders for the maintenance team — add them with photos and
              check them off.
            </span>
          </button>
        )}
      </div>

      <div className="home-footer-link">
        {can('analytics') && (
          <button className="text-link" onClick={() => onChoose('analytics')}>
            Analytics
          </button>
        )}
        {can('edit_machines') && (
          <button className="text-link" onClick={() => onChoose('edit')}>
            Edit machines
          </button>
        )}
        {can('settings') && (
          <button className="text-link" onClick={() => onChoose('settings')}>
            Admin Settings
          </button>
        )}
      </div>
    </div>
  );
}
