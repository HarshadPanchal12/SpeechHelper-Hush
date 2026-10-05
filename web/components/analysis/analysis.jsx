"use client";

import { useEffect, useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LineChart, Legend } from "@/components/analysis/line-chart";
import { Spectrogram } from "@/components/analysis/spectrogram";
import { WienerConcept } from "@/components/analysis/wiener-concept";
import {
  MAX_ANALYSIS_SECONDS,
  decimate,
  decodeMono,
  diffFrames,
  frameLevels,
  stft,
  summarize,
  toLogAxis,
  welchPsd,
} from "@/lib/dsp";
import { formatClock } from "@/lib/format";

const NOISE = "#8e8c86";
const CLEAN = "#0a6c74";
const FREQ_TICKS = [100, 200, 500, 1000, 2000, 5000, 10000, 20000].map((v) => ({
  v,
  label: v >= 1000 ? `${v / 1000}k` : `${v}`,
}));
const tick = () => new Promise((r) => setTimeout(r, 20));

function Panel({ title, children, caption }) {
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-5 sm:p-8">
      {title && (
        <div className="max-w-2xl space-y-1">
          <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
          {caption && <p className="text-muted-foreground">{caption}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

const db = (v) => (Number.isFinite(v) ? `${v.toFixed(1)} dB` : "n/a");
const delta = (v) => (Number.isFinite(v) ? `${v > 0 ? "+" : ""}${v.toFixed(1)} dB` : "n/a");

function MetricsTable({ o, c }) {
  const rows = [
    ["Overall level (RMS)", o.rmsDb, c.rmsDb],
    ["Peak level", o.peakDb, c.peakDb],
    ["Noise floor (quietest 10% of frames)", o.noiseFloorDb, c.noiseFloorDb],
    ["Speech level (loudest 10% of frames)", o.speechDb, c.speechDb],
    ["Estimated SNR", o.snrDb, c.snrDb],
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] text-left text-sm">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="py-2 pr-4 font-medium">Measure</th>
            <th className="py-2 pr-4 font-medium">Original</th>
            <th className="py-2 pr-4 font-medium">Cleaned</th>
            <th className="py-2 font-medium">Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, a, b]) => (
            <tr key={name} className="border-b last:border-0">
              <td className="py-2.5 pr-4">{name}</td>
              <td className="py-2.5 pr-4 tabular-nums">{db(a)}</td>
              <td className="py-2.5 pr-4 tabular-nums">{db(b)}</td>
              <td className="py-2.5 font-medium tabular-nums">{delta(b - a)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Analysis({ original, cleaned }) {
  const [base, setBase] = useState({ status: "loading" });
  const [grams, setGrams] = useState(null);
  const [nfft, setNfft] = useState(1024);
  const [maxFreq, setMaxFreq] = useState(8000);
  const [cursor, setCursor] = useState(0.5);

  // 1. Decode both signals and compute the cheap whole-signal measurements.
  useEffect(() => {
    let cancelled = false;
    setBase({ status: "loading" });
    (async () => {
      const [o, c] = await Promise.all([decodeMono(original), decodeMono(cleaned)]);
      if (cancelled) return;
      if (!o || !c) return setBase({ status: "unavailable" });
      await tick();
      if (cancelled) return;
      const n = Math.min(o.samples.length, c.samples.length);
      const os = o.samples.subarray(0, n);
      const cs = c.samples.subarray(0, n);
      const sr = c.sampleRate;
      const lo = frameLevels(os);
      const lc = frameLevels(cs);
      const po = welchPsd(os, sr);
      const pc = welchPsd(cs, sr);
      const ao = toLogAxis(po);
      const ac = toLogAxis(pc);
      setBase({
        status: "ready",
        sr,
        n,
        os,
        cs,
        truncated: c.truncated || o.truncated,
        totalSeconds: c.totalSeconds,
        levels: { o: lo, c: lc },
        metrics: { o: summarize(os, lo), c: summarize(cs, lc) },
        psd: { f: ao.f, o: ao.db, c: ac.db },
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [original, cleaned]);

  // 2. Spectrograms depend on the window size, so recompute when it changes.
  useEffect(() => {
    if (base.status !== "ready") return;
    let cancelled = false;
    setGrams(null);
    const id = setTimeout(() => {
      const so = stft(base.os, { nfft, hop: nfft / 2 });
      const sc = stft(base.cs, { nfft, hop: nfft / 2 });
      if (!cancelled) setGrams({ so, sc, diff: diffFrames(so, sc) });
    }, 30);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [base, nfft]);

  const analysed = base.status === "ready" ? base.n / base.sr : 0;
  const fmax = base.status === "ready" ? Math.min(20000, base.sr / 2) : 20000;

  const psdChart = useMemo(() => {
    if (base.status !== "ready") return null;
    const { f, o, c } = base.psd;
    const top = Math.ceil((Math.max(...o, ...c) + 5) / 10) * 10;
    return {
      f,
      o,
      c,
      att: o.map((v, i) => v - c[i]),
      y: [top - 90, top],
      yTicks: Array.from({ length: 5 }, (_, i) => top - 90 + i * 20 + 10).filter((v) => v <= top),
    };
  }, [base]);

  const levelChart = useMemo(() => {
    if (base.status !== "ready") return null;
    const n = Math.min(600, base.levels.o.length);
    const hopSec = 1024 / base.sr;
    return {
      x: Array.from({ length: n }, (_, i) => (i + 0.5) * (base.levels.o.length / n) * hopSec),
      o: decimate(base.levels.o, n),
      c: decimate(base.levels.c, n),
    };
  }, [base]);

  const inspector = useMemo(() => {
    if (!grams || grams.so.frames.length === 0) return null;
    const idx = Math.round(cursor * (grams.so.frames.length - 1));
    const binHz = base.sr / nfft;
    const freqs = Array.from({ length: grams.so.bins - 1 }, (_, k) => (k + 1) * binHz);
    return {
      t: (idx * grams.so.hop + nfft / 2) / base.sr,
      freqs,
      o: Array.from(grams.so.frames[idx]).slice(1),
      c: Array.from(grams.sc.frames[idx]).slice(1),
    };
  }, [grams, cursor, base, nfft]);

  if (base.status === "loading") {
    return (
      <div className="mt-10 rounded-2xl border bg-card p-8" aria-live="polite">
        <p className="font-medium">Analysing the signals…</p>
        <p className="text-sm text-muted-foreground">Decoding audio and computing spectra in your browser.</p>
      </div>
    );
  }
  if (base.status === "unavailable") {
    return (
      <div className="mt-10 rounded-2xl border bg-card p-8">
        <p className="font-medium">Analysis isn&apos;t available for this file.</p>
        <p className="text-sm text-muted-foreground">
          Your browser couldn&apos;t decode it, or it is too large to analyse in the browser. The cleaned audio
          is unaffected.
        </p>
      </div>
    );
  }

  const binHz = base.sr / nfft;
  const winMs = (nfft / base.sr) * 1000;
  const legend = [
    { name: "Original", color: NOISE },
    { name: "Cleaned", color: CLEAN },
  ];

  return (
    <div className="mt-10 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl space-y-1">
          <h2 className="text-3xl font-semibold tracking-tight">Signal analysis</h2>
          <p className="text-muted-foreground">
            Both signals are converted to mono at {base.sr / 1000} kHz and compared.
            {base.truncated
              ? ` Analysis covers the first ${MAX_ANALYSIS_SECONDS} seconds of ${formatClock(base.totalSeconds)}.`
              : ""}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()} data-noprint>
          <Printer className="size-4" /> Save report as PDF
        </Button>
      </div>

      <Panel
        title="Level measurements"
        caption="Measured from the recordings themselves. There is no clean reference, so SNR here means the gap between the loudest and quietest frames, an indicator rather than an exact figure."
      >
        <MetricsTable o={base.metrics.o} c={base.metrics.c} />
      </Panel>

      <Panel
        title="Spectrograms"
        caption="Time runs left to right, frequency bottom to top, and brighter means more energy. Noise shows up as a haze between words and above the voice. The bottom panel shows how many dB were removed from each cell. Click or drag on any panel to inspect that moment below."
      >
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3" data-noprint>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">Window size</span>
            <Tabs value={String(nfft)} onValueChange={(v) => setNfft(Number(v))}>
              <TabsList aria-label="FFT window size in samples">
                {[256, 512, 1024, 2048].map((n) => (
                  <TabsTrigger key={n} value={String(n)}>
                    {n}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">Show up to</span>
            <Tabs value={String(maxFreq)} onValueChange={(v) => setMaxFreq(Number(v))}>
              <TabsList aria-label="Highest frequency shown">
                <TabsTrigger value="8000">8 kHz</TabsTrigger>
                <TabsTrigger value={String(base.sr / 2)}>{base.sr / 2000} kHz</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          This window is {winMs.toFixed(0)} ms long, so each frequency bin is {binHz.toFixed(0)} Hz wide. A longer
          window separates close frequencies, such as the harmonics of a voice, but blurs timing. A shorter one
          does the opposite. This is the time-frequency uncertainty trade-off.
        </p>
        {grams ? (
          <div className="space-y-5">
            <Spectrogram
              data={grams.so}
              label="Original"
              maxFreq={maxFreq}
              sampleRate={base.sr}
              cursor={cursor}
              onCursor={setCursor}
            />
            <Spectrogram
              data={grams.sc}
              label="Cleaned"
              maxFreq={maxFreq}
              sampleRate={base.sr}
              cursor={cursor}
              onCursor={setCursor}
            />
            <Spectrogram
              data={grams.diff}
              kind="diff"
              minDb={0}
              maxDb={40}
              label="Energy removed (0 to 40 dB)"
              maxFreq={maxFreq}
              sampleRate={base.sr}
              cursor={cursor}
              onCursor={setCursor}
              durationSec={analysed}
              showTime
            />
          </div>
        ) : (
          <div className="h-64 animate-pulse rounded-md bg-muted" aria-label="Computing spectrograms" />
        )}
      </Panel>

      {inspector && (
        <Panel
          title={`Spectrum at ${inspector.t.toFixed(2)} s`}
          caption="One column of the spectrograms, drawn as a curve. The gap between the two lines is the noise that was removed at this instant. Speech shows as regularly spaced peaks (harmonics of the voice)."
        >
          <Legend items={legend} />
          <LineChart
            title="Magnitude spectrum of one frame, original and cleaned"
            x={inspector.freqs}
            xScale="log"
            xDomain={[50, fmax]}
            yDomain={[-120, -10]}
            xTicks={FREQ_TICKS.filter((t) => t.v <= fmax)}
            yTicks={[-110, -90, -70, -50, -30, -10]}
            xLabel="Frequency (Hz)"
            yLabel="Magnitude (dBFS)"
            series={[
              { name: "Original", color: NOISE, values: inspector.o, width: 1.3 },
              { name: "Cleaned", color: CLEAN, values: inspector.c, width: 1.3 },
            ]}
          />
        </Panel>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="Power spectral density"
          caption="Welch's method: the signal is cut into overlapping windowed segments and their power spectra are averaged. A steady noise floor appears as a raised baseline."
        >
          <Legend items={legend} />
          <LineChart
            title="Power spectral density, original and cleaned"
            x={psdChart.f}
            xScale="log"
            xDomain={[50, fmax]}
            yDomain={psdChart.y}
            xTicks={FREQ_TICKS.filter((t) => t.v <= fmax)}
            yTicks={psdChart.yTicks}
            xLabel="Frequency (Hz)"
            yLabel="Power density (dB/Hz)"
            series={[
              { name: "Original", color: NOISE, values: psdChart.o },
              { name: "Cleaned", color: CLEAN, values: psdChart.c },
            ]}
          />
        </Panel>

        <Panel
          title="Attenuation by frequency"
          caption="Original PSD minus cleaned PSD. It resembles a magnitude response, but a denoiser changes its gain from moment to moment, so this is an average for this recording only."
        >
          <Legend items={[{ name: "Attenuation", color: CLEAN }]} />
          <LineChart
            title="Average attenuation in dB against frequency"
            x={psdChart.f}
            xScale="log"
            xDomain={[50, fmax]}
            yDomain={[-5, 45]}
            xTicks={FREQ_TICKS.filter((t) => t.v <= fmax)}
            yTicks={[0, 10, 20, 30, 40]}
            xLabel="Frequency (Hz)"
            yLabel="Attenuation (dB)"
            series={[{ name: "Attenuation", color: CLEAN, values: psdChart.att }]}
          />
        </Panel>
      </div>

      <Panel
        title="Short-time level"
        caption="RMS level of each 43 ms frame. Speech makes the peaks, and the valleys between words are the noise floor. The dashed lines mark each signal's estimated floor, the 10th percentile of its frame levels."
      >
        <Legend items={legend} />
        <LineChart
          title="Short-time RMS level over time, original and cleaned"
          x={levelChart.x}
          xDomain={[0, analysed]}
          yDomain={[-100, 0]}
          xTicks={[0, 0.25, 0.5, 0.75, 1].map((t) => ({ v: t * analysed, label: formatClock(t * analysed) }))}
          yTicks={[-100, -80, -60, -40, -20, 0]}
          xLabel="Time"
          yLabel="Level (dBFS)"
          hLines={[
            { y: base.metrics.o.noiseFloorDb, color: NOISE, label: "Original floor" },
            { y: base.metrics.c.noiseFloorDb, color: CLEAN, label: "Cleaned floor" },
          ]}
          series={[
            { name: "Original", color: NOISE, values: levelChart.o },
            { name: "Cleaned", color: CLEAN, values: levelChart.c },
          ]}
        />
      </Panel>

      <Panel title="">
        <WienerConcept />
      </Panel>
    </div>
  );
}
