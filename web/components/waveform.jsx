"use client";

import { useEffect, useRef } from "react";

const BAR = 2;
const GAP = 1.5;

function draw(canvas, peaks, color, progress, scale) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const n = Math.max(1, Math.floor(w / (BAR + GAP)));
  const mid = h / 2;
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const from = Math.floor((i / n) * peaks.length);
    const to = Math.max(from + 1, Math.floor(((i + 1) / n) * peaks.length));
    let amp = 0;
    for (let j = from; j < to; j++) amp = Math.max(amp, peaks[j]);
    // sqrt makes quiet passages visible, which is where the noise floor lives
    const bar = Math.max(1.5, Math.sqrt(Math.min(1, amp / scale)) * (h - 4));
    ctx.globalAlpha = (i + 0.5) / n <= progress ? 1 : 0.38;
    ctx.fillRect(i * (BAR + GAP), mid - bar / 2, BAR, bar);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#0f1c21";
  ctx.fillRect(Math.min(w - 1.5, progress * w), 0, 1.5, h);
}

export function Waveform({ peaks, scale, color, progress, duration, onSeek, label }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !peaks) return;
    const render = () => draw(canvas, peaks, color, progress, scale);
    render();
    const ro = new ResizeObserver(render);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [peaks, color, progress, scale]);

  const seekFromEvent = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onSeek(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)));
  };

  const onKeyDown = (e) => {
    if (!duration) return;
    const step = 5 / duration;
    if (e.key === "ArrowRight") onSeek(Math.min(1, progress + step));
    else if (e.key === "ArrowLeft") onSeek(Math.max(0, progress - step));
    else return;
    e.preventDefault();
  };

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={`${label} waveform, seek`}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration || 0)}
      aria-valuenow={Math.round(progress * (duration || 0))}
      className="h-20 w-full cursor-pointer touch-none rounded-md"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        seekFromEvent(e);
      }}
      onPointerMove={(e) => e.buttons === 1 && seekFromEvent(e)}
      onKeyDown={onKeyDown}
    >
      {peaks ? (
        <canvas ref={ref} className="h-full w-full" />
      ) : (
        <div className="relative flex h-full items-center">
          <div className="h-1 w-full rounded-full bg-muted">
            <div className="h-full rounded-full" style={{ width: `${progress * 100}%`, background: color }} />
          </div>
        </div>
      )}
    </div>
  );
}
