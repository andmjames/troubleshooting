import React, { useEffect, useRef, useState } from 'react';
import { IconSend } from '../lib/icons';
import { signedUrl, createTroubleshootJob, pollTroubleshootJob } from '../lib/supabase';
import { renderPdfPage } from '../lib/pdfRender';
import { useToast } from './Toast';

// Render a tiny subset of markdown (bullets, **bold**, paragraphs) safely as React nodes.
function renderAnswer(text) {
  const lines = (text || '').split('\n');
  const blocks = [];
  let bullets = [];
  const flush = () => {
    if (bullets.length) { blocks.push({ type: 'ul', items: bullets }); bullets = []; }
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (/^[-*•]\s+/.test(line)) { bullets.push(line.replace(/^[-*•]\s+/, '')); }
    else { flush(); blocks.push({ type: 'p', text: line }); }
  }
  flush();
  const fmt = (str, key) => {
    const parts = str.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p, i) =>
      /^\*\*[^*]+\*\*$/.test(p)
        ? <strong key={`${key}-${i}`}>{p.slice(2, -2)}</strong>
        : <span key={`${key}-${i}`}>{p}</span>
    );
  };
  return blocks.map((b, i) =>
    b.type === 'ul'
      ? <ul key={i}>{b.items.map((it, j) => <li key={j}>{fmt(it, `${i}-${j}`)}</li>)}</ul>
      : <p key={i}>{fmt(b.text, i)}</p>
  );
}

function Thumb({ img, onOpen }) {
  const [src, setSrc] = useState(img.kind === 'manual-page' ? null : (img.url || null));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    if (img.kind === 'manual-page' && img.url) {
      renderPdfPage(img.url, img.page)
        .then((dataUrl) => { if (alive) setSrc(dataUrl); })
        .catch(() => { if (alive) setFailed(true); });
    } else if (!img.url && img.path) {
      // legacy fallback
      signedUrl(img.bucket || 'manual-pages', img.path).then((u) => { if (alive) setSrc(u); });
    }
    return () => { alive = false; };
  }, [img]);

  if (failed) return null;
  if (!src) {
    // loading placeholder while a manual page renders
    return <div className="msg-thumb msg-thumb-loading"><span className="spinner" /></div>;
  }
  return <img className="msg-thumb" src={src} alt={img.label || ''} onClick={() => onOpen(src)} />;
}

export default function TroubleshootChat({ machine, onBack, onClose }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `What's going on with the ${machine.name}? Describe the problem — what it's doing, any error codes or unusual sounds, and when it started.`,
    },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const scrollRef = useRef(null);
  const taRef = useRef(null);
  const toast = useToast();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const autosize = () => {
    const ta = taRef.current;
    if (ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'; }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    const history = [...messages, { role: 'user', content: text }];
    setMessages(history);
    setInput('');
    setTimeout(autosize, 0);
    setBusy(true);
    try {
      const jobId = await createTroubleshootJob({
        machineId: machine.id,
        machineName: machine.name,
        messages: history.map(({ role, content }) => ({ role, content })),
      });
      const data = await pollTroubleshootJob(jobId);
      setMessages((m) => [...m, {
        role: 'assistant',
        content: data.answer || 'I could not find anything useful for that.',
        sources: data.sources || [],
        images: data.images || [],
      }]);
    } catch (e) {
      toast(e.message || 'Something went wrong', 'error');
      setMessages((m) => [...m, {
        role: 'assistant',
        content: "I couldn't get an answer that time. Try again in a moment.",
      }]);
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const detailParts = [];
  if (machine.model_number) detailParts.push(`Model ${machine.model_number}`);
  if (machine.serial_number) detailParts.push(`S/N ${machine.serial_number}`);
  if (machine.manufacturer_phone) detailParts.push(machine.manufacturer_phone);
  if (machine.manufacturer_email) detailParts.push(machine.manufacturer_email);

  return (
    <div className="chat-wrap">
      <div className="chat-context-bar">
        <div className="chat-context-main">
          <div className="chat-context-top">
            Troubleshooting <span className="chat-context-machine">{machine.name}</span>
          </div>
          {detailParts.length > 0 && (
            <div className="chat-context-details">{detailParts.join('  ·  ')}</div>
          )}
        </div>
        <div className="chat-context-actions">
          <button className="btn btn-ghost btn-sm" onClick={onBack}>Change machine</button>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        </div>
      </div>

      <div className="chat-scroll" ref={scrollRef}>
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role === 'user' ? 'msg-user' : 'msg-ai'}`}>
            <div className="msg-bubble">
              {m.role === 'assistant' ? renderAnswer(m.content) : m.content}
            </div>

            {m.images && m.images.length > 0 && (
              <div className="msg-images">
                {m.images.map((img, j) => (
                  <Thumb key={j} img={img} onOpen={setLightbox} />
                ))}
              </div>
            )}

            {m.sources && m.sources.length > 0 && (
              <div className="msg-sources">
                {m.sources.map((sct, j) => {
                  const cls = sct.type === 'log' ? 'src-chip-log'
                    : sct.type === 'manual' ? 'src-chip-manual' : 'src-chip-web';
                  return sct.url ? (
                    <a key={j} className={`src-chip ${cls}`} href={sct.url} target="_blank" rel="noreferrer">{sct.label}</a>
                  ) : (
                    <span key={j} className={`src-chip ${cls}`}>{sct.label}</span>
                  );
                })}
              </div>
            )}
          </div>
        ))}

        {busy && (
          <div className="chat-thinking"><span className="spinner" /> Searching repair logs, manuals, and the web…</div>
        )}
      </div>

      <div className="chat-composer">
        <textarea
          ref={taRef}
          className="chat-input"
          rows={1}
          placeholder="Describe the problem…"
          value={input}
          onChange={(e) => { setInput(e.target.value); autosize(); }}
          onKeyDown={onKeyDown}
          disabled={busy}
        />
        <button className="btn btn-primary" onClick={send} disabled={busy || !input.trim()}>
          <IconSend /> Send
        </button>
      </div>

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" />
        </div>
      )}
    </div>
  );
}
