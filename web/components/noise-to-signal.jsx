// Decorative: the same speech, noisy on the left and clean on the right.
const COUNT = 110;

function rand(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r = rand(7);
const BARS = Array.from({ length: COUNT }, (_, i) => {
  const t = i / (COUNT - 1);
  const speech = Math.pow(Math.abs(Math.sin(i / 5.2)) * Math.abs(Math.sin(i / 13 + 1)), 1.2) * 26;
  const noise = (1 - t) * (4 + r() * 14);
  return { x: i * 6.5, h: Math.max(2, speech + noise), t };
});

function mix(t) {
  const a = [142, 140, 134];
  const b = [10, 108, 116];
  return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * t)).join(",")})`;
}

export function NoiseToSignal({ className }) {
  return (
    <svg viewBox="0 0 715 64" className={className} preserveAspectRatio="none" aria-hidden>
      {BARS.map((b, i) => (
        <rect key={i} x={b.x} y={32 - b.h / 2} width="3" height={b.h} rx="1.5" fill={mix(b.t)} />
      ))}
    </svg>
  );
}
