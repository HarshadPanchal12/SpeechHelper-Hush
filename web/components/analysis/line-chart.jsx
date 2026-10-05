"use client";

import { useId } from "react";

const W = 640;
const H = 260;
const M = { l: 52, r: 14, t: 12, b: 38 };

// Minimal SVG line chart: linear or log x axis, fixed y domain, reference lines, one marker.
export function LineChart({
  x,
  series,
  xScale = "linear",
  xDomain,
  yDomain,
  xTicks,
  yTicks,
  xLabel,
  yLabel,
  hLines = [],
  vLine,
  marker,
  title,
}) {
  const clipId = useId();
  const [x0, x1] = xDomain || [x[0], x[x.length - 1]];
  const [y0, y1] = yDomain;
  const fx = (v) =>
    xScale === "log"
      ? (Math.log(v) - Math.log(x0)) / (Math.log(x1) - Math.log(x0))
      : (v - x0) / (x1 - x0);
  const px = (v) => M.l + fx(v) * (W - M.l - M.r);
  const py = (v) => M.t + (1 - (v - y0) / (y1 - y0)) * (H - M.t - M.b);

  const paths = series.map((s) => {
    let d = "";
    for (let i = 0; i < x.length; i++) {
      if (x[i] < x0 || x[i] > x1 || !Number.isFinite(s.values[i])) continue;
      d += `${d ? "L" : "M"}${px(x[i]).toFixed(1)},${py(s.values[i]).toFixed(1)}`;
    }
    return d;
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={title}>
      <defs>
        <clipPath id={clipId}>
          <rect x={M.l} y={M.t} width={W - M.l - M.r} height={H - M.t - M.b} />
        </clipPath>
      </defs>

      {yTicks.map((v) => (
        <g key={`y${v}`}>
          <line x1={M.l} x2={W - M.r} y1={py(v)} y2={py(v)} stroke="var(--border)" />
          <text x={M.l - 8} y={py(v) + 4} textAnchor="end" fontSize="11" className="fill-muted-foreground">
            {v}
          </text>
        </g>
      ))}
      {xTicks.map((t) => (
        <g key={`x${t.v}`}>
          <line x1={px(t.v)} x2={px(t.v)} y1={M.t} y2={H - M.b} stroke="var(--border)" />
          <text x={px(t.v)} y={H - M.b + 16} textAnchor="middle" fontSize="11" className="fill-muted-foreground">
            {t.label}
          </text>
        </g>
      ))}

      <g clipPath={`url(#${clipId})`}>
        {hLines.map((h) => (
          <line
            key={h.label}
            x1={M.l}
            x2={W - M.r}
            y1={py(h.y)}
            y2={py(h.y)}
            stroke={h.color}
            strokeDasharray="5 4"
            strokeWidth="1.2"
          />
        ))}
        {paths.map((d, i) => (
          <path
            key={series[i].name}
            d={d}
            fill="none"
            stroke={series[i].color}
            strokeWidth={series[i].width || 1.6}
            strokeLinejoin="round"
          />
        ))}
        {vLine != null && (
          <line x1={px(vLine)} x2={px(vLine)} y1={M.t} y2={H - M.b} stroke="var(--foreground)" strokeWidth="1.2" />
        )}
      </g>
      {marker && <circle cx={px(marker.x)} cy={py(marker.y)} r="5" fill="var(--primary)" stroke="white" strokeWidth="2" />}

      <text x={(M.l + W - M.r) / 2} y={H - 4} textAnchor="middle" fontSize="12" className="fill-foreground">
        {xLabel}
      </text>
      <text
        transform={`translate(13 ${(M.t + H - M.b) / 2}) rotate(-90)`}
        textAnchor="middle"
        fontSize="12"
        className="fill-foreground"
      >
        {yLabel}
      </text>
    </svg>
  );
}

export function Legend({ items }) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
      {items.map((i) => (
        <li key={i.name} className="flex items-center gap-2">
          <span className="inline-block h-0.5 w-5 rounded" style={{ background: i.color }} />
          {i.name}
        </li>
      ))}
    </ul>
  );
}
