// Small DSP toolkit used by the analysis section. Everything runs in the browser.

export const ANALYSIS_SR = 48000;
export const MAX_ANALYSIS_SECONDS = 60;

// Decode to mono at a fixed rate so the original and cleaned signals line up sample for sample.
export async function decodeMono(blob, sampleRate = ANALYSIS_SR, maxSeconds = MAX_ANALYSIS_SECONDS) {
  if (blob.size > 150 * 1024 * 1024) return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  let ctx;
  try {
    ctx = new Ctx({ sampleRate });
  } catch {
    ctx = new Ctx();
  }
  try {
    const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
    const n = Math.min(audio.length, Math.floor(maxSeconds * audio.sampleRate));
    const samples = new Float32Array(n);
    const chans = audio.numberOfChannels;
    for (let c = 0; c < chans; c++) {
      const data = audio.getChannelData(c);
      for (let i = 0; i < n; i++) samples[i] += data[i] / chans;
    }
    return { samples, sampleRate: audio.sampleRate, totalSeconds: audio.duration, truncated: audio.length > n };
  } catch {
    return null;
  } finally {
    ctx.close();
  }
}

// ── FFT (iterative radix-2) ────────────────────────────────────────────────
const fftCache = new Map();

function getFft(n) {
  if (fftCache.has(n)) return fftCache.get(n);
  const cos = new Float64Array(n / 2);
  const sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / n);
    sin[i] = Math.sin((2 * Math.PI * i) / n);
  }
  const bits = Math.log2(n);
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
    rev[i] = r;
  }
  const fft = (re, im) => {
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let size = 2; size <= n; size *= 2) {
      const half = size / 2;
      const step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = i, k = 0; j < i + half; j++, k += step) {
          const l = j + half;
          const tre = re[l] * cos[k] + im[l] * sin[k];
          const tim = -re[l] * sin[k] + im[l] * cos[k];
          re[l] = re[j] - tre;
          im[l] = im[j] - tim;
          re[j] += tre;
          im[j] += tim;
        }
      }
    }
  };
  fftCache.set(n, fft);
  return fft;
}

export function hann(n) {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  return w;
}

// ── Short-time Fourier transform, magnitudes in dBFS (a full-scale sine reads about 0 dB) ──
export function stft(samples, { nfft = 1024, hop = nfft / 2 } = {}) {
  const fft = getFft(nfft);
  const win = hann(nfft);
  let winSum = 0;
  for (let i = 0; i < nfft; i++) winSum += win[i];
  const bins = nfft / 2 + 1;
  const count = Math.max(0, Math.floor((samples.length - nfft) / hop) + 1);
  const re = new Float64Array(nfft);
  const im = new Float64Array(nfft);
  const frames = new Array(count);
  for (let f = 0; f < count; f++) {
    const off = f * hop;
    for (let i = 0; i < nfft; i++) {
      re[i] = samples[off + i] * win[i];
      im[i] = 0;
    }
    fft(re, im);
    const row = new Float32Array(bins);
    for (let k = 0; k < bins; k++) {
      const mag = (Math.hypot(re[k], im[k]) * 2) / winSum;
      row[k] = 20 * Math.log10(mag + 1e-9);
    }
    frames[f] = row;
  }
  return { frames, bins, nfft, hop };
}

// How much energy was removed per time-frequency cell (dB, never negative).
export function diffFrames(a, b) {
  const count = Math.min(a.frames.length, b.frames.length);
  const frames = new Array(count);
  for (let f = 0; f < count; f++) {
    const row = new Float32Array(a.bins);
    for (let k = 0; k < a.bins; k++) row[k] = Math.max(0, a.frames[f][k] - b.frames[f][k]);
    frames[f] = row;
  }
  return { frames, bins: a.bins, nfft: a.nfft, hop: a.hop };
}

// ── Welch power spectral density, resampled onto a log-frequency axis ──
export function welchPsd(samples, sampleRate, nfft = 4096) {
  const fft = getFft(nfft);
  const win = hann(nfft);
  let winPow = 0;
  for (let i = 0; i < nfft; i++) winPow += win[i] * win[i];
  const hop = nfft / 2;
  const bins = nfft / 2 + 1;
  const acc = new Float64Array(bins);
  const re = new Float64Array(nfft);
  const im = new Float64Array(nfft);
  const count = Math.max(1, Math.floor((samples.length - nfft) / hop) + 1);
  let used = 0;
  for (let f = 0; f < count; f++) {
    const off = f * hop;
    if (off + nfft > samples.length) break;
    for (let i = 0; i < nfft; i++) {
      re[i] = samples[off + i] * win[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k < bins; k++) acc[k] += re[k] * re[k] + im[k] * im[k];
    used++;
  }
  const scale = 1 / (Math.max(1, used) * sampleRate * winPow);
  for (let k = 0; k < bins; k++) acc[k] *= scale;
  return { psd: acc, nfft, sampleRate };
}

export function toLogAxis({ psd, nfft, sampleRate }, points = 220, fmin = 50, fmax = Math.min(20000, sampleRate / 2)) {
  const df = sampleRate / nfft;
  const f = new Array(points);
  const db = new Array(points);
  for (let i = 0; i < points; i++) {
    const f0 = fmin * Math.pow(fmax / fmin, i / points);
    const f1 = fmin * Math.pow(fmax / fmin, (i + 1) / points);
    const k0 = Math.max(1, Math.floor(f0 / df));
    const k1 = Math.min(psd.length - 1, Math.max(k0, Math.ceil(f1 / df)));
    let sum = 0;
    for (let k = k0; k <= k1; k++) sum += psd[k];
    f[i] = Math.sqrt(f0 * f1);
    db[i] = 10 * Math.log10(sum / (k1 - k0 + 1) + 1e-20);
  }
  return { f, db };
}

// ── Short-time level (RMS per frame, dBFS) and summary metrics ──
export function frameLevels(samples, win = 2048, hop = 1024) {
  const count = Math.max(0, Math.floor((samples.length - win) / hop) + 1);
  const out = new Float32Array(count);
  for (let f = 0; f < count; f++) {
    let s = 0;
    const off = f * hop;
    for (let i = 0; i < win; i++) s += samples[off + i] * samples[off + i];
    out[f] = 10 * Math.log10(s / win + 1e-10);
  }
  return out;
}

export function summarize(samples, levels) {
  let sum = 0;
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
    const a = Math.abs(samples[i]);
    if (a > peak) peak = a;
  }
  const sorted = Array.from(levels).filter((v) => v > -90).sort((a, b) => a - b);
  const q = (p) => (sorted.length ? sorted[Math.floor(p * (sorted.length - 1))] : NaN);
  const noiseFloorDb = q(0.1);
  const speechDb = q(0.9);
  return {
    rmsDb: 10 * Math.log10(sum / Math.max(1, samples.length) + 1e-10),
    peakDb: 20 * Math.log10(peak + 1e-10),
    noiseFloorDb,
    speechDb,
    snrDb: speechDb - noiseFloorDb,
  };
}

// Average groups of values down to at most `n` points (for drawing long series).
export function decimate(values, n) {
  if (values.length <= n) return Array.from(values);
  const out = new Array(n);
  const size = values.length / n;
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * size);
    const b = Math.max(a + 1, Math.floor((i + 1) * size));
    let s = 0;
    for (let j = a; j < b; j++) s += values[j];
    out[i] = s / (b - a);
  }
  return out;
}

// ── Colormaps ──
function lut(stops) {
  const out = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let s = 0;
    while (s < stops.length - 2 && t > stops[s + 1][0]) s++;
    const [t0, c0] = stops[s];
    const [t1, c1] = stops[s + 1];
    const u = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
    for (let k = 0; k < 3; k++) out[i * 3 + k] = c0[k] + (c1[k] - c0[k]) * u;
  }
  return out;
}

export const COLORMAPS = {
  level: lut([
    [0, [0, 0, 4]],
    [0.25, [66, 10, 104]],
    [0.5, [147, 38, 103]],
    [0.75, [221, 81, 58]],
    [0.9, [252, 165, 10]],
    [1, [252, 255, 164]],
  ]),
  diff: lut([
    [0, [243, 246, 245]],
    [0.5, [96, 176, 180]],
    [1, [6, 62, 70]],
  ]),
};

// Classical Wiener gain for a given a priori SNR (dB): G = xi / (1 + xi).
export function wienerGain(snrDb) {
  const xi = Math.pow(10, snrDb / 10);
  return xi / (1 + xi);
}
