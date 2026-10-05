const MAX_DECODE_BYTES = 150 * 1024 * 1024; // decoded audio is ~10x larger than the file

// Returns { peaks: Float32Array, duration } or null when the browser can't (or shouldn't) decode it.
export async function computePeaks(blob, buckets = 1000) {
  if (blob.size > MAX_DECODE_BYTES) return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx();
  try {
    const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
    const peaks = new Float32Array(buckets);
    const size = audio.length / buckets;
    for (let c = 0; c < audio.numberOfChannels; c++) {
      const data = audio.getChannelData(c);
      for (let b = 0; b < buckets; b++) {
        const from = Math.floor(b * size);
        const to = Math.min(audio.length, Math.floor((b + 1) * size));
        let max = peaks[b];
        for (let i = from; i < to; i++) {
          const v = Math.abs(data[i]);
          if (v > max) max = v;
        }
        peaks[b] = max;
      }
    }
    return { peaks, duration: audio.duration };
  } catch {
    return null;
  } finally {
    ctx.close();
  }
}
