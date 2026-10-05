"""Chunked, constant-memory denoising.

The file is read in ~30 s windows with 1 s of extra context on each side. The
context warms up the model before the part we keep, so cuts between chunks are
not audible, and memory stays flat no matter how long the recording is.
"""
import math

import numpy as np
import soundfile as sf


class Cancelled(Exception):
    pass


def _align(frames: int, step: int) -> int:
    return max(step, (frames // step) * step)


def denoise_file(
    in_path,
    out_path,
    engine,
    *,
    atten_lim_db=None,
    chunk_seconds=30.0,
    context_seconds=1.0,
    on_progress=None,
    should_cancel=None,
):
    """Write a mono 16-bit WAV at engine.sample_rate. Returns output length in samples."""
    target = engine.sample_rate
    with sf.SoundFile(in_path) as src:
        sr, total = src.samplerate, len(src)
        if total == 0:
            raise ValueError("The audio file is empty.")

        # Chunk edges are multiples of `step` input frames so they map to whole
        # output samples after resampling (e.g. 44.1 kHz -> 48 kHz: 147 -> 160).
        g = math.gcd(sr, target)
        step, out_per_step = sr // g, target // g
        chunk = _align(int(chunk_seconds * sr), step)
        ctx = _align(int(context_seconds * sr), step)

        written = 0
        with sf.SoundFile(out_path, "w", samplerate=target, channels=1,
                          subtype="PCM_16", format="WAV") as dst:
            pos = 0
            while pos < total:
                if should_cancel and should_cancel():
                    raise Cancelled()

                start = max(0, pos - ctx)
                end = min(total, pos + chunk + ctx)
                src.seek(start)
                data = src.read(end - start, dtype="float32", always_2d=True)
                mono = np.ascontiguousarray(data.mean(axis=1), dtype=np.float32)

                mono = engine.resample(mono, sr)
                enhanced = engine.enhance(np.ascontiguousarray(mono, dtype=np.float32), atten_lim_db)

                lead = (pos - start) // step * out_per_step
                is_last = pos + chunk >= total
                if is_last:
                    piece = enhanced[lead:]
                else:
                    want = chunk // step * out_per_step
                    piece = enhanced[lead:lead + want]
                    if len(piece) < want:  # keep the timeline aligned
                        piece = np.pad(piece, (0, want - len(piece)))

                dst.write(np.clip(piece, -1.0, 1.0))
                written += len(piece)
                pos += chunk
                if on_progress:
                    on_progress(min(1.0, pos / total))
    return written
