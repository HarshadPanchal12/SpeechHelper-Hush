"use client";

import { useHealth } from "@/components/health-provider";

export function Limits() {
  const { health } = useHealth();
  const rows = [
    ["Largest file", health ? `${health.max_upload_mb} MB` : "Unavailable"],
    ["Longest recording", health ? `${health.max_duration_min} minutes` : "Unavailable"],
    ["Accepted formats", health ? health.formats.join(", ").toUpperCase() : "Unavailable"],
    ["What you get back", health ? `Mono WAV, ${health.sample_rate / 1000} kHz, 16-bit` : "Unavailable"],
  ];
  return (
    <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt className="text-sm text-muted-foreground">{k}</dt>
          <dd className="font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
