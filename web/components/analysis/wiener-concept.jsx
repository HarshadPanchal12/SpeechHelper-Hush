"use client";

import { useState } from "react";
import { LineChart } from "@/components/analysis/line-chart";
import { wienerGain } from "@/lib/dsp";

const X = Array.from({ length: 101 }, (_, i) => -20 + i * 0.5);
const Y = X.map((s) => 20 * Math.log10(wienerGain(s)));

// Concept panel: the classical spectral gain that noise suppressors build on.
export function WienerConcept() {
  const [snr, setSnr] = useState(0);
  const g = wienerGain(snr);
  const gDb = 20 * Math.log10(g);

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div className="space-y-4">
        <h3 className="text-xl font-semibold tracking-tight">Concept: how a noise suppressor decides what to keep</h3>
        <p className="max-w-prose text-muted-foreground">
          Speech enhancement works on the spectrogram. For each time-frequency cell it estimates how much of the
          energy is speech, then multiplies that cell by a gain between 0 and 1. The classical rule is the Wiener
          gain, G = ξ / (1 + ξ), where ξ is the speech-to-noise power ratio in that cell. Strong speech passes
          almost untouched, and cells dominated by noise are pushed toward zero.
        </p>
        <p className="max-w-prose text-muted-foreground">
          DeepFilterNet replaces the hand-written estimate of ξ with a neural network. As described in its papers,
          it predicts real-valued gains across ERB-spaced frequency bands, and adds a short complex filter
          (&ldquo;deep filtering&rdquo;) at lower frequencies, where speech harmonics are most easily damaged by plain gains.
        </p>
        <div className="space-y-2 pt-2">
          <label htmlFor="snr" className="text-sm font-medium">
            Speech-to-noise ratio in a cell: {snr > 0 ? "+" : ""}
            {snr} dB
          </label>
          <input
            id="snr"
            type="range"
            min={-20}
            max={30}
            step={1}
            value={snr}
            onChange={(e) => setSnr(Number(e.target.value))}
            className="w-full accent-[var(--primary)]"
          />
          <p className="text-sm text-muted-foreground tabular-nums">
            Gain {g.toFixed(3)} ({gDb.toFixed(1)} dB). That cell keeps {(g * 100).toFixed(1)}% of its amplitude.
          </p>
        </div>
      </div>
      <LineChart
        title="Wiener gain in dB against speech-to-noise ratio"
        x={X}
        series={[{ name: "Wiener gain", color: "#0a6c74", values: Y }]}
        xDomain={[-20, 30]}
        yDomain={[-40, 2]}
        xTicks={[-20, -10, 0, 10, 20, 30].map((v) => ({ v, label: `${v}` }))}
        yTicks={[-40, -30, -20, -10, 0]}
        xLabel="Speech-to-noise ratio ξ (dB)"
        yLabel="Gain (dB)"
        marker={{ x: snr, y: gDb }}
      />
    </div>
  );
}
