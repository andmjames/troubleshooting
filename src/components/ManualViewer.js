import React, { useEffect, useRef, useState, useReducer, useCallback } from 'react';
import { getPdf, renderPageToDataUrl } from '../lib/pdfRender';

// Full-manual viewer: loads the whole PDF, opens scrolled to `initialPage`, and lets
// the user scroll through every page before and after it. Pages render lazily as they
// approach the viewport and far ones are dropped, so even a long manual stays light.
const KEEP_WINDOW = 6;   // render/keep pages within this distance of a visible page

export default function ManualViewer({ url, initialPage = 1, title, onClose }) {
  const [numPages, setNumPages] = useState(0);
  const [ratio, setRatio] = useState(1.294);   // page height / width (default US Letter)
  const [width, setWidth] = useState(0);
  const [current, setCurrent] = useState(initialPage);
  const [error, setError] = useState(false);

  const docRef = useRef(null);
  const scrollRef = useRef(null);
  const pageEls = useRef({});
  const rendered = useRef(new Map());   // pageNum -> dataURL | 'loading'
  const didScroll = useRef(false);
  const [, force] = useReducer((x) => x + 1, 0);

  // Load the document.
  useEffect(() => {
    let alive = true;
    getPdf(url).then(async (doc) => {
      if (!alive) return;
      docRef.current = doc;
      setNumPages(doc.numPages);
      try {
        const p = await doc.getPage(Math.min(Math.max(initialPage, 1), doc.numPages));
        const vp = p.getViewport({ scale: 1 });
        if (alive) setRatio(vp.height / vp.width);
      } catch { /* keep default ratio */ }
    }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [url, initialPage]);

  // Track the rendering width.
  useEffect(() => {
    const measure = () => { if (scrollRef.current) setWidth(scrollRef.current.clientWidth); };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [numPages]);

  const renderPageNum = useCallback(async (n) => {
    if (!docRef.current || !width) return;
    if (rendered.current.has(n)) return;
    rendered.current.set(n, 'loading');
    try {
      const dpr = window.devicePixelRatio || 1;
      const page = await docRef.current.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const scale = (width * dpr) / base.width;
      const dataUrl = await renderPageToDataUrl(docRef.current, n, scale);
      rendered.current.set(n, dataUrl);
      // Evict pages far from this one to bound memory.
      for (const k of [...rendered.current.keys()]) {
        if (Math.abs(k - n) > KEEP_WINDOW) rendered.current.delete(k);
      }
      force();
    } catch {
      rendered.current.delete(n);
    }
  }, [width]);

  // Render pages as they approach the viewport; update the page indicator.
  useEffect(() => {
    if (!numPages || !width || !scrollRef.current) return undefined;
    const io = new IntersectionObserver((entries) => {
      let top = null; let topRatio = 0;
      entries.forEach((e) => {
        const n = parseInt(e.target.dataset.page, 10);
        if (e.isIntersecting) renderPageNum(n);
        if (e.intersectionRatio > topRatio) { topRatio = e.intersectionRatio; top = n; }
      });
      if (top != null) setCurrent(top);
    }, { root: scrollRef.current, rootMargin: '700px 0px', threshold: [0, 0.25, 0.5] });
    Object.values(pageEls.current).forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [numPages, width, renderPageNum]);

  // Jump to the cited page once the pages are laid out.
  useEffect(() => {
    if (didScroll.current || !numPages || !width) return;
    const el = pageEls.current[Math.min(Math.max(initialPage, 1), numPages)];
    if (el) { el.scrollIntoView({ block: 'start' }); didScroll.current = true; }
  }, [numPages, width, initialPage]);

  // ── Gestures ──
  // The scroll area uses touch-action:none so the browser never steals the gesture.
  // We drive it ourselves: one finger drags to scroll (with momentum), two fingers
  // pinch to zoom. This is the only way to get reliable pinch-zoom inside a scroller
  // on mobile (native two-finger pans would otherwise swallow the pinch).
  const zoomRef = useRef(1);
  const zoomWrapRef = useRef(null);
  const pointers = useRef(new Map());
  const gesture = useRef('none');    // 'none' | 'pan' | 'pinch'
  const panLast = useRef({ x: 0, y: 0, t: 0 });
  const velocity = useRef({ x: 0, y: 0 });
  const momentumRaf = useRef(null);
  const pinchDist = useRef(0);
  const lastTap = useRef(0);
  const MINZ = 1;
  const MAXZ = 5;
  const clampZ = (z) => Math.max(MINZ, Math.min(MAXZ, z));

  // Re-apply the current zoom after every render (lazy page loads trigger renders).
  useEffect(() => {
    if (zoomWrapRef.current) zoomWrapRef.current.style.zoom = String(zoomRef.current);
  });

  useEffect(() => () => { if (momentumRaf.current) cancelAnimationFrame(momentumRaf.current); }, []);

  const stopMomentum = () => {
    if (momentumRaf.current) { cancelAnimationFrame(momentumRaf.current); momentumRaf.current = null; }
  };
  const startMomentum = () => {
    const v = { ...velocity.current };
    if (Math.abs(v.x) < 0.03 && Math.abs(v.y) < 0.03) return;
    const step = () => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTop += v.y * 16;
      el.scrollLeft += v.x * 16;
      v.x *= 0.93; v.y *= 0.93;
      if (Math.abs(v.x) > 0.03 || Math.abs(v.y) > 0.03) {
        momentumRaf.current = requestAnimationFrame(step);
      } else {
        momentumRaf.current = null;
      }
    };
    momentumRaf.current = requestAnimationFrame(step);
  };

  const applyZoom = (nextZoom, midX, midY) => {
    const el = scrollRef.current;
    const wrap = zoomWrapRef.current;
    if (!el || !wrap) return;
    const rect = el.getBoundingClientRect();
    const mx = midX - rect.left;
    const my = midY - rect.top;
    const z0 = zoomRef.current;
    const z1 = clampZ(nextZoom);
    if (z1 === z0) return;
    const sx = (el.scrollLeft + mx) * (z1 / z0) - mx;
    const sy = (el.scrollTop + my) * (z1 / z0) - my;
    zoomRef.current = z1;
    wrap.style.zoom = String(z1);
    el.scrollLeft = sx;
    el.scrollTop = sy;
  };

  const twoFingerDist = () => {
    const ps = [...pointers.current.values()];
    return Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
  };
  const twoFingerMid = () => {
    const ps = [...pointers.current.values()];
    return { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 };
  };

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    stopMomentum();
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2) {
      gesture.current = 'pinch';
      pinchDist.current = twoFingerDist();
    } else {
      gesture.current = 'pan';
      panLast.current = { x: e.clientX, y: e.clientY, t: performance.now() };
      velocity.current = { x: 0, y: 0 };
      const now = Date.now();
      if (now - lastTap.current < 300) {
        applyZoom(zoomRef.current > 1.2 ? 1 : 2.5, e.clientX, e.clientY);
        lastTap.current = 0;
      } else {
        lastTap.current = now;
      }
    }
  };

  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gesture.current === 'pinch' && pointers.current.size >= 2) {
      const d = twoFingerDist();
      const mid = twoFingerMid();
      const ratio = d / (pinchDist.current || d);
      pinchDist.current = d;
      applyZoom(zoomRef.current * ratio, mid.x, mid.y);
    } else if (gesture.current === 'pan' && pointers.current.size === 1) {
      const el = scrollRef.current;
      if (!el) return;
      const now = performance.now();
      const dx = e.clientX - panLast.current.x;
      const dy = e.clientY - panLast.current.y;
      el.scrollLeft -= dx;
      el.scrollTop -= dy;
      const dt = Math.max(1, now - panLast.current.t);
      velocity.current = { x: -dx / dt, y: -dy / dt };
      panLast.current = { x: e.clientX, y: e.clientY, t: now };
    }
  };

  const endPointer = (e) => {
    const wasPan = gesture.current === 'pan' && pointers.current.size === 1;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      if (wasPan) startMomentum();
      gesture.current = 'none';
    } else if (pointers.current.size === 1) {
      // dropped from a pinch to one finger — resume panning from the remaining finger
      const [p] = [...pointers.current.values()];
      panLast.current = { x: p.x, y: p.y, t: performance.now() };
      velocity.current = { x: 0, y: 0 };
      gesture.current = 'pan';
      pinchDist.current = 0;
    }
  };

  const placeholderH = width ? Math.round(width * ratio) : 400;

  return (
    <div className="pdfv-overlay">
      <div className="pdfv-bar">
        <span className="pdfv-title">{title || 'Manual'}</span>
        <span className="pdfv-count">{numPages ? `Page ${current} / ${numPages}` : ''}</span>
        <button className="pdfv-close" onClick={onClose} aria-label="Close">×</button>
      </div>

      <div
        className="pdfv-scroll"
        ref={scrollRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
      >
        {error ? (
          <div className="pdfv-msg">Couldn't open this manual.</div>
        ) : !numPages ? (
          <div className="pdfv-msg"><span className="spinner" /> Loading manual…</div>
        ) : (
          <div className="pdfv-zoom" ref={zoomWrapRef}>
            {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => {
              const src = rendered.current.get(n);
              const ready = src && src !== 'loading';
              return (
                <div
                  key={n}
                  data-page={n}
                  ref={(el) => { pageEls.current[n] = el; }}
                  className="pdfv-page"
                  style={ready ? undefined : { height: placeholderH }}
                >
                  {ready
                    ? <img src={src} alt={`Page ${n}`} draggable={false} />
                    : <div className="pdfv-page-loading"><span className="spinner" /> Page {n}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
