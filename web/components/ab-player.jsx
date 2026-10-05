"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Waveform } from "@/components/waveform";
import { computePeaks } from "@/lib/peaks";
import { formatClock } from "@/lib/format";

const NOISE = "#8e8c86";
const CLEAN = "#0a6c74";

// Plays the original and cleaned audio in lockstep. Switching tabs just swaps which one is audible.
export function AbPlayer({ original, cleaned }) {
  const origRef = useRef(null);
  const cleanRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState("clean");
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [peaks, setPeaks] = useState({ original: undefined, cleaned: undefined });

  useEffect(() => {
    const o = new Audio(URL.createObjectURL(original));
    const c = new Audio(URL.createObjectURL(cleaned));
    origRef.current = o;
    cleanRef.current = c;
    const onMeta = () => setDuration(c.duration || 0);
    const onEnd = () => {
      o.pause();
      c.pause();
      setPlaying(false);
    };
    c.addEventListener("loadedmetadata", onMeta);
    c.addEventListener("ended", onEnd);
    setReady(true);
    return () => {
      c.removeEventListener("loadedmetadata", onMeta);
      c.removeEventListener("ended", onEnd);
      o.pause();
      c.pause();
      URL.revokeObjectURL(o.src);
      URL.revokeObjectURL(c.src);
      setReady(false);
      setPlaying(false);
    };
  }, [original, cleaned]);

  useEffect(() => {
    let cancelled = false;
    setPeaks({ original: undefined, cleaned: undefined });
    computePeaks(original).then((r) => !cancelled && setPeaks((p) => ({ ...p, original: r })));
    computePeaks(cleaned).then((r) => !cancelled && setPeaks((p) => ({ ...p, cleaned: r })));
    return () => {
      cancelled = true;
    };
  }, [original, cleaned]);

  useEffect(() => {
    if (!ready) return;
    origRef.current.muted = mode !== "original";
    cleanRef.current.muted = mode !== "clean";
  }, [mode, ready]);

  // Follow the playhead and keep the two tracks aligned.
  useEffect(() => {
    if (!playing) return;
    let raf;
    const tick = () => {
      const c = cleanRef.current;
      const o = origRef.current;
      setTime(c.currentTime);
      if (Math.abs(o.currentTime - c.currentTime) > 0.08) o.currentTime = c.currentTime;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const toggle = useCallback(async () => {
    const o = origRef.current;
    const c = cleanRef.current;
    if (!o || !c) return;
    if (playing) {
      o.pause();
      c.pause();
      setPlaying(false);
      return;
    }
    try {
      if (duration && c.currentTime >= duration - 0.05) o.currentTime = c.currentTime = 0;
      o.currentTime = c.currentTime;
      await Promise.all([o.play(), c.play()]);
      setPlaying(true);
    } catch {
      toast.error("Your browser couldn't play this file.");
    }
  }, [playing, duration]);

  const seek = useCallback(
    (fraction) => {
      if (!duration) return;
      const t = fraction * duration;
      origRef.current.currentTime = t;
      cleanRef.current.currentTime = t;
      setTime(t);
    },
    [duration]
  );

  const scale = useMemo(() => {
    const maxOf = (r) => (r ? r.peaks.reduce((m, v) => (v > m ? v : m), 0) : 0);
    return Math.max(maxOf(peaks.original), maxOf(peaks.cleaned), 0.02);
  }, [peaks]);

  const progress = duration ? Math.min(1, time / duration) : 0;
  const rows = [
    { key: "cleaned", label: "Cleaned", mode: "clean", color: CLEAN },
    { key: "original", label: "Original", mode: "original", color: NOISE },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button
            size="icon"
            className="size-11 rounded-full"
            onClick={toggle}
            disabled={!ready}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause className="size-5" /> : <Play className="size-5 translate-x-px" />}
          </Button>
          <span className="tabular-nums text-sm text-muted-foreground">
            {formatClock(time)} / {formatClock(duration)}
          </span>
        </div>
        <Tabs value={mode} onValueChange={setMode}>
          <TabsList aria-label="Which version you hear">
            <TabsTrigger value="clean">Hear cleaned</TabsTrigger>
            <TabsTrigger value="original">Hear original</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="space-y-4">
        {rows.map((row) => {
          const active = mode === row.mode;
          const r = peaks[row.key];
          return (
            <div key={row.key} className={active ? "" : "opacity-60"} style={{ transition: "opacity 150ms" }}>
              <p className="mb-1 text-sm font-medium">{row.label}</p>
              {r === undefined ? (
                <div className="h-20 animate-pulse rounded-md bg-muted" />
              ) : (
                <Waveform
                  peaks={r?.peaks ?? null}
                  scale={scale}
                  color={row.color}
                  progress={progress}
                  duration={duration}
                  onSeek={seek}
                  label={row.label}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
