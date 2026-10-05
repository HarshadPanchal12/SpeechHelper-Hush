"use client";

import { useCallback, useRef, useState } from "react";
import { AlertCircle, Download, FileAudio, Loader2, RotateCcw, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AbPlayer } from "@/components/ab-player";
import { Analysis } from "@/components/analysis/analysis";
import { NoiseToSignal } from "@/components/noise-to-signal";
import { useHealth } from "@/components/health-provider";
import { useDenoise } from "@/hooks/use-denoise";
import { addHistory } from "@/lib/history";
import { formatBytes, formatElapsed } from "@/lib/format";

const STRENGTHS = [
  { id: "gentle", label: "Gentle", note: "Keeps more of the room", db: 12 },
  { id: "balanced", label: "Balanced", note: "Good for most recordings", db: 24 },
  { id: "maximum", label: "Maximum", note: "Removes as much as possible", db: null },
];

const AUDIO_EXT = /\.(wav|mp3|ogg|flac|m4a|aac|opus|webm|mp4)$/i;

function Progress({ value }) {
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
    >
      <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${value * 100}%` }} />
    </div>
  );
}

export function Denoiser() {
  const { status, health, refresh } = useHealth();
  const [file, setFile] = useState(null);
  const [strength, setStrength] = useState("balanced");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const { state, start, cancel, reset } = useDenoise({
    onDone: ({ file, duration, elapsed }) => {
      addHistory({
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        durationSec: duration,
        elapsedSec: elapsed,
        strength: STRENGTHS.find((s) => s.id === strength)?.label,
        at: Date.now(),
      });
    },
  });

  const choose = useCallback(
    (f) => {
      if (!f) return;
      if (!f.type.startsWith("audio/") && !AUDIO_EXT.test(f.name)) {
        toast.error("That doesn't look like an audio file.");
        return;
      }
      if (health && f.size > health.max_upload_mb * 1024 * 1024) {
        toast.error(`That file is ${formatBytes(f.size)}. The limit is ${health.max_upload_mb} MB.`);
        return;
      }
      setFile(f);
    },
    [health]
  );

  const run = () => start(file, STRENGTHS.find((s) => s.id === strength).db);
  const startOver = () => {
    reset();
    setFile(null);
  };

  const busy = state.phase === "uploading" || state.phase === "processing";

  return (
    <>
    <section className="rounded-2xl border bg-card p-5 sm:p-8" aria-live="polite">
      {status === "offline" && (
        <div className="mb-6 flex gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="space-y-2">
            <p className="font-medium">Can&apos;t reach the denoising server.</p>
            <p className="text-muted-foreground">Start it in another terminal, then check again:</p>
            <code className="block overflow-x-auto rounded-md bg-muted px-3 py-2 text-xs">
              cd backend &amp;&amp; uvicorn main:app --port 8000
            </code>
            <Button variant="outline" size="sm" onClick={refresh}>
              Check again
            </Button>
          </div>
        </div>
      )}

      {state.phase === "done" ? (
        <div className="space-y-6">
          <AbPlayer original={state.file} cleaned={state.blob} />
          <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-5">
            <p className="text-sm text-muted-foreground">
              {state.file.name}
              {state.elapsed ? `. Cleaned in ${formatElapsed(state.elapsed)}.` : ""}
            </p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={startOver}>
                <RotateCcw className="size-4" /> Clean another file
              </Button>
              <Button asChild>
                <a href={URL.createObjectURL(state.blob)} download={`${state.file.name.replace(/\.[^.]+$/, "")}-clean.wav`}>
                  <Download className="size-4" /> Download WAV
                </a>
              </Button>
            </div>
          </div>
        </div>
      ) : busy ? (
        <div className="space-y-5 py-4">
          <div className="flex items-center gap-3">
            <Loader2 className="size-5 animate-spin text-primary" />
            <div>
              <p className="font-medium">
                {state.phase === "uploading"
                  ? `Uploading ${Math.round(state.progress * 100)}%`
                  : state.queue > 0
                    ? `Waiting for ${state.queue} other ${state.queue === 1 ? "file" : "files"}`
                    : `Cleaning audio ${Math.round(state.progress * 100)}%`}
              </p>
              <p className="text-sm text-muted-foreground">
                {state.file.name} ({formatBytes(state.file.size)})
                {state.phase === "processing" && state.elapsed > 2 ? `. ${formatElapsed(state.elapsed)} so far.` : ""}
              </p>
            </div>
          </div>
          <Progress value={state.progress} />
          <Button variant="outline" size="sm" onClick={cancel}>
            <X className="size-4" /> Cancel
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          <label
            htmlFor="audio-file"
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              choose(e.dataTransfer.files?.[0]);
            }}
            className={`flex cursor-pointer flex-col items-center gap-4 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring ${
              dragging ? "border-primary bg-accent" : "border-input hover:border-primary/60"
            }`}
          >
            <NoiseToSignal className="h-14 w-full max-w-md" />
            {file ? (
              <div className="flex items-center gap-3">
                <FileAudio className="size-5 text-primary" />
                <div className="text-left">
                  <p className="font-medium">{file.name}</p>
                  <p className="text-sm text-muted-foreground">{formatBytes(file.size)}. Click to choose a different file.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="flex items-center justify-center gap-2 font-medium">
                  <Upload className="size-4" /> Drop an audio file here, or click to choose one
                </p>
                <p className="text-sm text-muted-foreground">
                  {health
                    ? `${health.formats.slice(0, 5).join(", ").toUpperCase()} and more. Up to ${health.max_upload_mb} MB or ${health.max_duration_min} minutes.`
                    : "WAV, MP3, FLAC, OGG or M4A."}
                </p>
              </div>
            )}
            <input
              ref={inputRef}
              id="audio-file"
              type="file"
              accept="audio/*,.m4a,.aac,.opus"
              className="sr-only"
              onChange={(e) => {
                choose(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>

          {state.phase === "error" && (
            <div className="flex gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm" role="alert">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <p>{state.message}</p>
            </div>
          )}

          <fieldset className="space-y-3">
            <legend className="mb-1 text-sm font-medium">Noise reduction</legend>
            <RadioGroup value={strength} onValueChange={setStrength} className="grid gap-3 sm:grid-cols-3">
              {STRENGTHS.map((s) => (
                <Label
                  key={s.id}
                  htmlFor={`strength-${s.id}`}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal ${
                    strength === s.id ? "border-primary bg-accent" : "hover:border-primary/50"
                  }`}
                >
                  <RadioGroupItem id={`strength-${s.id}`} value={s.id} className="mt-0.5" />
                  <span>
                    <span className="block text-sm font-medium">{s.label}</span>
                    <span className="block text-sm text-muted-foreground">{s.note}</span>
                  </span>
                </Label>
              ))}
            </RadioGroup>
          </fieldset>

          <Button size="lg" onClick={run} disabled={!file || status === "offline" || status === "unauthorized"}>
            Clean audio
          </Button>
        </div>
      )}
    </section>
    {state.phase === "done" && <Analysis original={state.file} cleaned={state.blob} />}
    </>
  );
}
