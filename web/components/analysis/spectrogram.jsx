"use client";

import { useEffect, useRef } from "react";
import { COLORMAPS } from "@/lib/dsp";
import { formatClock } from "@/lib/format";

// Draws STFT magnitudes (time on x, frequency on y). Click or use arrow keys to move the cursor.
export function Spectrogram({
  data,
  label,
  kind = "level",
  minDb = -110,
  maxDb = -20,
  maxFreq,
  sampleRate,
  cursor,
  onCursor,
  durationSec,
  showTime,
}) {
  const canvasRef = useRef(null);
  const offRef = useRef(null);

  // Rasterise one pixel per (frame, bin) into an off-screen canvas.
  useEffect(() => {
    if (!data || data.frames.length === 0) return;
    const binHz = sampleRate / data.nfft;
    const shown = Math.min(data.bins, Math.floor(maxFreq / binHz) + 1);
    const w = data.frames.length;
    const off = document.createElement("canvas");
    off.width = w;
    off.height = shown;
    const ctx = off.getContext("2d");
    const img = ctx.createImageData(w, shown);
    const map = COLORMAPS[kind];
    const span = maxDb - minDb;
    for (let f = 0; f < w; f++) {
      const row = data.frames[f];
      for (let b = 0; b < shown; b++) {
        const t = Math.min(1, Math.max(0, (row[b] - minDb) / span));
        const li = Math.round(t * 255) * 3;
        const p = ((shown - 1 - b) * w + f) * 4;
        img.data[p] = map[li];
        img.data[p + 1] = map[li + 1];
        img.data[p + 2] = map[li + 2];
        img.data[p + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    offRef.current = off;
    paint();

    function paint() {
      const canvas = canvasRef.current;
      if (!canvas || !offRef.current) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      const c = canvas.getContext("2d");
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = "high";
      c.drawImage(offRef.current, 0, 0, canvas.width, canvas.height);
    }
    const ro = new ResizeObserver(paint);
    ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, [data, kind, minDb, maxDb, maxFreq, sampleRate]);

  const step = maxFreq <= 8000 ? 2000 : 6000;
  const ticks = [];
  for (let f = 0; f <= maxFreq; f += step) ticks.push(f);

  const pick = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    onCursor(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
  };

  return (
    <figure>
      <figcaption className="mb-1 text-sm font-medium">{label}</figcaption>
      <div className="flex gap-2">
        <div className="relative h-40 w-9 shrink-0 text-right text-[11px] text-muted-foreground" aria-hidden>
          {ticks.map((f) => (
            <span
              key={f}
              className="absolute right-0 -translate-y-1/2 tabular-nums"
              style={{ top: `${(1 - f / maxFreq) * 100}%` }}
            >
              {f / 1000}k
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="relative h-40 cursor-crosshair overflow-hidden rounded-md border"
            role="slider"
            tabIndex={0}
            aria-label={`${label} spectrogram. Move the inspection cursor.`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round((cursor ?? 0) * 100)}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              pick(e);
            }}
            onPointerMove={(e) => e.buttons === 1 && pick(e)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") onCursor(Math.min(1, (cursor ?? 0) + 0.01));
              else if (e.key === "ArrowLeft") onCursor(Math.max(0, (cursor ?? 0) - 0.01));
              else return;
              e.preventDefault();
            }}
          >
            <canvas ref={canvasRef} className="h-full w-full" />
            {cursor != null && (
              <div
                className="pointer-events-none absolute inset-y-0 w-px bg-white mix-blend-difference"
                style={{ left: `${cursor * 100}%` }}
              />
            )}
          </div>
          {showTime && (
            <div className="mt-1 flex justify-between text-[11px] tabular-nums text-muted-foreground" aria-hidden>
              {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                <span key={t}>{formatClock(t * durationSec)}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </figure>
  );
}
