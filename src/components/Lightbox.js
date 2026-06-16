import React, { useRef, useState } from 'react';

// Full-screen image viewer with zoom + pan.
// - Touch: pinch to zoom, drag to pan, double-tap to toggle zoom.
// - Desktop: scroll wheel to zoom, double-click to toggle, drag to pan.
const MIN = 1;
const MAX = 6;

export default function Lightbox({ src, onClose }) {
  const [scale, setScale] = useState(1);
  const [t, setT] = useState({ x: 0, y: 0 });
  const wrapRef = useRef(null);
  const pointers = useRef(new Map());
  const pinchDist = useRef(null);
  const panLast = useRef(null);
  const lastTap = useRef(0);

  const clamp = (s) => Math.max(MIN, Math.min(MAX, s));

  const centerOf = () => {
    const r = wrapRef.current?.getBoundingClientRect();
    return r ? { cx: r.left + r.width / 2, cy: r.top + r.height / 2 } : { cx: 0, cy: 0 };
  };

  // Zoom keeping the point (clientX, clientY) fixed on screen.
  const zoomAround = (clientX, clientY, next) => {
    const { cx, cy } = centerOf();
    const ox = clientX - cx;
    const oy = clientY - cy;
    setScale((s0) => {
      const s1 = clamp(next(s0));
      setT((t0) => {
        if (s1 <= MIN + 0.001) return { x: 0, y: 0 };
        const k = s1 / s0;
        return { x: ox - k * (ox - t0.x), y: oy - k * (oy - t0.y) };
      });
      return s1 <= MIN + 0.001 ? MIN : s1;
    });
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
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      pinchDist.current = twoFingerDist();
      panLast.current = null;
    } else if (pointers.current.size === 1) {
      panLast.current = scale > 1 ? { x: e.clientX, y: e.clientY } : null;
      const now = Date.now();
      if (now - lastTap.current < 300) {
        zoomAround(e.clientX, e.clientY, (s0) => (s0 > 1.2 ? 1 : 2.8));
        lastTap.current = 0;
      } else {
        lastTap.current = now;
      }
    }
  };

  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinchDist.current) {
      const d = twoFingerDist();
      const m = twoFingerMid();
      const factor = d / (pinchDist.current || d);
      pinchDist.current = d;
      zoomAround(m.x, m.y, (s0) => s0 * factor);
    } else if (pointers.current.size === 1 && panLast.current && scale > 1) {
      const dx = e.clientX - panLast.current.x;
      const dy = e.clientY - panLast.current.y;
      panLast.current = { x: e.clientX, y: e.clientY };
      setT((t0) => ({ x: t0.x + dx, y: t0.y + dy }));
    }
  };

  const endPointer = (e) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchDist.current = null;
    if (pointers.current.size === 0) panLast.current = null;
  };

  const onWheel = (e) => {
    e.preventDefault();
    zoomAround(e.clientX, e.clientY, (s0) => s0 * (1 - e.deltaY * 0.0015));
  };

  const reset = () => { setScale(1); setT({ x: 0, y: 0 }); };

  return (
    <div
      className="lightbox"
      ref={wrapRef}
      onClick={() => { if (scale <= 1.001) onClose(); }}
      onWheel={onWheel}
    >
      <button
        className="lightbox-close"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="Close"
      >×</button>

      <img
        className="lightbox-img"
        src={src}
        alt=""
        draggable={false}
        style={{
          transform: `translate(${t.x}px, ${t.y}px) scale(${scale})`,
          cursor: scale > 1 ? 'grab' : 'zoom-in',
        }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
      />

      {scale > 1 && (
        <button className="lightbox-reset" onClick={(e) => { e.stopPropagation(); reset(); }}>Reset zoom</button>
      )}
    </div>
  );
}
