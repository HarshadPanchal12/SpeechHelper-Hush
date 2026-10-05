"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { deleteJob, getAudio, getJob, uploadJob } from "@/lib/api";

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
}

// idle -> uploading -> processing -> done | error
export function useDenoise({ onDone } = {}) {
  const [state, setState] = useState({ phase: "idle" });
  const abortRef = useRef(null);
  const jobRef = useRef(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (jobRef.current) deleteJob(jobRef.current); // also cancels a running job server-side
    jobRef.current = null;
  }, []);

  const reset = useCallback(() => {
    stop();
    setState({ phase: "idle" });
  }, [stop]);

  useEffect(() => stop, [stop]);

  const start = useCallback(async (file, attenLimDb) => {
    const ac = new AbortController();
    abortRef.current = ac;
    setState({ phase: "uploading", file, progress: 0 });

    try {
      const { id } = await uploadJob({
        file,
        attenLimDb,
        signal: ac.signal,
        onProgress: (progress) =>
          setState((s) => (s.phase === "uploading" ? { ...s, progress } : s)),
      });
      jobRef.current = id;
      setState({ phase: "processing", file, progress: 0, queue: 0, elapsed: 0 });

      let delay = 700;
      let failures = 0;
      let job;
      for (;;) {
        try {
          job = await getJob(id, ac.signal);
          failures = 0;
        } catch (err) {
          if (err.name === "AbortError" || err.status === 404 || ++failures >= 4) throw err;
          await sleep(1500, ac.signal);
          continue;
        }
        if (job.status === "done") break;
        if (job.status === "error") throw new Error(job.error || "Processing failed.");
        if (job.status === "cancelled") throw new Error("Processing was cancelled.");
        setState({
          phase: "processing",
          file,
          progress: job.progress,
          queue: job.queue_position,
          elapsed: job.elapsed_sec,
          duration: job.duration_sec,
        });
        await sleep(delay, ac.signal);
        delay = Math.min(delay * 1.15, 2000);
      }

      const blob = await getAudio(id, ac.signal);
      deleteJob(id); // the result is in the browser now; free the server copy
      jobRef.current = null;
      const done = { phase: "done", file, blob, duration: job.duration_sec, elapsed: job.elapsed_sec };
      setState(done);
      onDoneRef.current?.(done);
    } catch (err) {
      if (ac.signal.aborted || err.name === "AbortError") return;
      setState({ phase: "error", file, message: err.message || "Something went wrong." });
    }
  }, []);

  return { state, start, cancel: reset, reset };
}
