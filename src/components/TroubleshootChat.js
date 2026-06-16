import React, { useEffect, useRef, useState } from 'react';
import { IconSend, IconCamera } from '../lib/icons';
import { signedUrl, createTroubleshootJob, pollTroubleshootJob, uploadTroubleshootPhoto, removeTroubleshootPhoto } from '../lib/supabase';
import { compressImage } from '../lib/image';
import { renderPdfPage } from '../lib/pdfRender';
import Lightbox from './Lightbox';
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
  const [attachments, setAttachments] = useState([]); // { id, previewUrl, path, status }
  const scrollRef = useRef(null);
  const taRef = useRef(null);
  const fileRef = useRef(null);
  const toast = useToast();

  const uploadingPhotos = attachments.some((a) => a.status === 'uploading');

  const addFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter((f) => f.type && f.type.startsWith('image/'));
    if (!files.length) return;
    const room = Math.max(0, 6 - attachments.length);
    for (const file of files.slice(0, room)) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const previewUrl = URL.createObjectURL(file);
      setAttachments((a) => [...a, { id, previewUrl, path: null, status: 'uploading' }]);
      try {
        const blob = await compressImage(file);
        const path = await uploadTroubleshootPhoto(blob, machine.id);
        setAttachments((a) => a.map((x) => (x.id === id ? { ...x, path, status: 'ready' } : x)));
      } catch (e) {
        setAttachments((a) => a.map((x) => (x.id === id ? { ...x, status: 'error' } : x)));
        toast('A photo failed to upload', 'error');
      }
    }
  };

  const removeAttachment = (id) => {
    setAttachments((a) => {
      const found = a.find((x) => x.id === id);
      if (found) {
        if (found.previewUrl) URL.revokeObjectURL(found.previewUrl);
        if (found.path) removeTroubleshootPhoto(found.path);
      }
      return a.filter((x) => x.id !== id);
    });
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const autosize = () => {
    const ta = taRef.current;
    if (ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'; }
  };

  const send = async () => {
    const text = input.trim();
    if (busy || uploadingPhotos) return;
    const photos = attachments.filter((a) => a.status === 'ready');
    if (!text && photos.length === 0) return;

    const userMsg = {
      role: 'user',
      content: text || '(see attached photos)',
      images: photos.map((p) => ({ kind: 'photo', url: p.previewUrl })),
      imagePaths: photos.map((p) => p.path),
    };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput('');
    setAttachments([]); // preview URLs stay alive for the message bubble
    setTimeout(autosize, 0);
    setBusy(true);
    try {
      const jobId = await createTroubleshootJob({
        machineId: machine.id,
        machineName: machine.name,
        messages: history.map(({ role, content, imagePaths }) => ({ role, content, imagePaths })),
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
        {attachments.length > 0 && (
          <div className="chat-attachments">
            {attachments.map((a) => (
              <div key={a.id} className="chat-attach-thumb">
                <img src={a.previewUrl} alt="" />
                {a.status === 'uploading' && <div className="chat-attach-overlay"><span className="spinner" /></div>}
                {a.status === 'error' && <div className="chat-attach-overlay chat-attach-error">!</div>}
                <button type="button" className="chat-attach-remove" onClick={() => removeAttachment(a.id)} aria-label="Remove photo">×</button>
              </div>
            ))}
          </div>
        )}
        <div className="chat-composer-row">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
          />
          <button
            type="button"
            className="btn btn-ghost chat-attach-btn"
            onClick={() => fileRef.current?.click()}
            disabled={busy || attachments.length >= 6}
            aria-label="Add photo"
            title="Add a photo"
          >
            <IconCamera />
          </button>
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
          <button
            className="btn btn-primary"
            onClick={send}
            disabled={busy || uploadingPhotos || (!input.trim() && !attachments.some((a) => a.status === 'ready'))}
          >
            <IconSend /> Send
          </button>
        </div>
      </div>

      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}
