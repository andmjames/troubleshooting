import React from 'react';
import { IconChat, IconWrench } from '../lib/icons';

export default function Home({ onChoose }) {
  return (
    <div className="home-wrap">
      <div className="home-eyebrow">PMI Tape · Maintenance</div>
      <h1 className="home-title">Equipment Troubleshooting</h1>
      <p className="home-sub">Get troubleshooting help or log a repair.</p>

      <div className="home-cards">
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
          <span className="home-card-title">Log a repair</span>
          <span className="home-card-desc">
            Record a problem and how you fixed it, with photos, so it's there next
            time something similar happens.
          </span>
        </button>
      </div>

      <div className="home-footer-link">
        <button className="text-link" onClick={() => onChoose('edit')}>
          Edit machines
        </button>
      </div>
    </div>
  );
}
