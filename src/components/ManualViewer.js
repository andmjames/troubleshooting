import React, { useEffect, useRef, useState, useReducer, useCallback } from 'react';
import { getPdf, renderPageToDataUrl } from '../lib/pdfRender';

// Full-manual viewer: loads the whole PDF, opens scrolled to `initialPage`, and lets
// the user scroll through every page before and after it. Pages render lazily as they
// approach the viewport and far ones are dropped, so even a long manual stays light.
//
// The rest of the app disables pinch-zoom via the viewport meta tag. While this viewer
// is open we temporarily re-enable native pinch-zoom (rock solid, unlike custom touch
// handling) and restore the lock on close.
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

  // Re-enable native pinch-zoom while open; restore the app's zoom lock on close.
  useEffect(() => {
    const meta = document.querySelector('meta[name="viewport"]');
    if (!meta) return undefined;
    const prev = meta.getAttribute('content');
    meta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=6.0, user-scalable=yes, viewport-fit=cover');
    return () => { if (prev != null) meta.setAttribute('content', prev); };
  }, []);

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
      // Render a bit above screen resolution so native pinch-zoom stays reasonably sharp.
      const scale = (width * dpr * 1.5) / base.width;
      const dataUrl = await renderPageToDataUrl(docRef.current, n, scale);
      rendered.current.set(n, dataUrl);
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

  const placeholderH = width ? Math.round(width * ratio) : 400;

  return (
    <div className="pdfv-overlay">
      <div className="pdfv-bar">
        <span className="pdfv-title">{title || 'Manual'}</span>
        <span className="pdfv-count">{numPages ? `Page ${current} / ${numPages}` : ''}</span>
        <button className="pdfv-close" onClick={onClose} aria-label="Close">×</button>
      </div>

      <div className="pdfv-scroll" ref={scrollRef}>
        {error ? (
          <div className="pdfv-msg">Couldn't open this manual.</div>
        ) : !numPages ? (
          <div className="pdfv-msg"><span className="spinner" /> Loading manual…</div>
        ) : (
          Array.from({ length: numPages }, (_, i) => i + 1).map((n) => {
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
                  ? <img src={src} alt={`Page ${n}`} />
                  : <div className="pdfv-page-loading"><span className="spinner" /> Page {n}</div>}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
