"use client";

import { useHealth } from "@/components/health-provider";

const LABELS = {
  checking: "Checking server",
  online: "Server ready",
  offline: "Server offline",
  unauthorized: "Sign in required",
};

export function BackendStatus() {
  const { status, health } = useHealth();
  const color =
    status === "online" ? "bg-primary" : status === "checking" ? "bg-noise" : "bg-destructive";
  return (
    <span
      className="hidden items-center gap-2 text-sm text-muted-foreground sm:inline-flex"
      title={health ? `Engine: ${health.engine}, ${health.sample_rate / 1000} kHz` : undefined}
      role="status"
    >
      <span className={`size-2 rounded-full ${color}`} aria-hidden />
      {LABELS[status]}
    </span>
  );
}
