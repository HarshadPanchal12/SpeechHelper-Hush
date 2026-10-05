import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import os, io, time
os.environ["HUSH_ENGINE"]="dryrun"; os.environ["DENOISE_API_KEY"]="secret"; os.environ["MAX_DURATION_MIN"]="1"
import numpy as np, soundfile as sf
from fastapi.testclient import TestClient
import main
c = TestClient(main.app)
H = {"x-api-key":"secret"}

def wav(secs, sr=44100):
    b = io.BytesIO(); x = (0.3*np.sin(2*np.pi*440*np.arange(int(sr*secs))/sr)).astype("float32")
    sf.write(b, x, sr, format="WAV"); b.seek(0); return b

print("health", c.get("/api/health").json()["engine"])
print("no key ->", c.post("/api/jobs", files={"file":("a.wav", wav(1))}).status_code)
print("bad ext ->", c.post("/api/jobs", files={"file":("a.txt", b"hi")}, headers=H).status_code)
print("too long ->", c.post("/api/jobs", files={"file":("a.wav", wav(70, 8000))}, headers=H).status_code)
r = c.post("/api/jobs", files={"file":("My Clip.wav", wav(3))}, data={"atten_lim_db":"24"}, headers=H)
print("create ->", r.status_code, r.json()); jid = r.json()["id"]
for _ in range(50):
    s = c.get(f"/api/jobs/{jid}", headers=H).json()
    if s["status"] in ("done","error"): break
    time.sleep(0.1)
print("status ->", s)
a = c.get(f"/api/jobs/{jid}/audio", headers=H); y, sr = sf.read(io.BytesIO(a.content))
print("audio ->", a.status_code, a.headers["content-type"], sr, len(y))
print("delete ->", c.delete(f"/api/jobs/{jid}", headers=H).json(), "| after:", c.get(f"/api/jobs/{jid}", headers=H).status_code)
print("leftover files:", os.listdir(main.WORK_DIR))
