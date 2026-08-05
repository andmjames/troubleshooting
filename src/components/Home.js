import React from 'react';
import { IconChat, IconWrench, IconCalendar } from '../lib/icons';

export default function Home({ onChoose }) {
  return (
    <div className="home-wrap">
      <div className="home-eyebrow">PMI Tape · Maintenance</div>
      <h1 className="home-title">Equipment Troubleshooting</h1>

      <div className="home-cards home-cards-3">
        <button className="home-card" onClick={() => onChoose('troubleshoot')}>
          <span className="home-card-icon"><IconChat /></span>
          <span className="home-card-title">Help me with troubleshooting</span>
          <span className="home-card-desc">
            Pick a machine, describe what's wrong, and get answers from past repairs,
            the manuals, and the web.
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

        <button className="home-card" onClick={() => onChoose('pm')}>
          <span className="home-card-icon"><IconCalendar /></span>
          <span className="home-card-title">Preventative maintenance</span>
          <span className="home-card-desc">
            See what's due, work through a machine's checklist, and log completed
            maintenance.
          </span>
        </button>
      </div>

      <div className="home-footer-link">
        <button className="text-link" onClick={() => onChoose('edit')}>
          Edit machines
        </button>
        <button className="text-link" onClick={() => onChoose('settings')}>
          Settings
        </button>
      </div>
    </div>
  );
}
