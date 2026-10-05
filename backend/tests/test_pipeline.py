import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import numpy as np, soundfile as sf, os, tempfile
from engine import DryRunEngine
from pipeline import denoise_file

eng = DryRunEngine()
d = tempfile.mkdtemp()
rng = np.random.default_rng(0)

for sr, secs, chunk in [(48000, 25, 7), (44100, 25, 7), (16000, 19, 5), (22050, 3, 30)]:
    t = np.arange(int(sr*secs))/sr
    x = (0.4*np.sin(2*np.pi*220*t) + 0.2*np.sin(2*np.pi*3*t*50)).astype(np.float32)
    # stereo input to test mono mixdown
    sf.write(f"{d}/in.wav", np.stack([x, x], 1), sr, subtype="FLOAT")
    n = denoise_file(f"{d}/in.wav", f"{d}/out.wav", eng, chunk_seconds=chunk, context_seconds=1.0)
    y, osr = sf.read(f"{d}/out.wav", dtype="float32")
    # reference: whole-file processing in one go
    ref = eng.enhance(eng.resample(x, sr))
    L = min(len(ref), len(y))
    err = np.max(np.abs(y[:L]-ref[:L]))
    print(f"sr={sr} chunk={chunk}s  out_len={len(y)} ref_len={len(ref)} diff_len={len(y)-len(ref)}  max_err={err:.5f}  written={n}")
    assert osr == 48000 and abs(len(y)-len(ref)) <= 2 and err < 2e-3
print("pipeline OK")
