import asyncio
import os
import secrets
import shutil
import subprocess
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Optional

import soundfile as sf
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from engine import load_engine
from pipeline import Cancelled, denoise_file

# ── Configuration (all overridable with environment variables) ──────────────
API_KEY = os.getenv("DENOISE_API_KEY", "").strip()
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "500"))
MAX_DURATION_MIN = int(os.getenv("MAX_DURATION_MIN", "120"))
CHUNK_SECONDS = float(os.getenv("CHUNK_SECONDS", "30"))
JOB_TTL_SECONDS = int(os.getenv("JOB_TTL_SECONDS", "1800"))
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()]
ALLOWED_EXT = {".wav", ".mp3", ".ogg", ".flac", ".m4a", ".aac", ".opus", ".webm", ".mp4"}
WORK_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "temp_audio")
os.makedirs(WORK_DIR, exist_ok=True)

print("⚡ Loading engine...")
engine = load_engine()
print(f"🚀 Engine '{engine.name}' ready at {engine.sample_rate} Hz")

executor = ThreadPoolExecutor(max_workers=1)  # one job at a time; the rest queue


@dataclass
class Job:
    id: str
    filename: str
    input_path: str
    output_path: str
    atten_lim_db: Optional[float]
    status: str = "queued"  # queued | processing | done | error | cancelled
    progress: float = 0.0
    error: Optional[str] = None
    duration_sec: Optional[float] = None
    created: float = field(default_factory=time.time)
    started: Optional[float] = None
    finished: Optional[float] = None
    cancel: bool = False


jobs: dict[str, Job] = {}


def _remove(*paths):
    for p in paths:
        try:
            if p and os.path.exists(p):
                os.remove(p)
        except OSError:
            pass


def _to_wav_with_ffmpeg(src: str, job_id: str) -> str:
    if shutil.which("ffmpeg") is None:
        raise RuntimeError("This format needs ffmpeg on the server. Install ffmpeg or upload WAV/FLAC/MP3.")
    dst = os.path.join(WORK_DIR, f"{job_id}_decoded.wav")
    proc = subprocess.run(
        ["ffmpeg", "-y", "-i", src, "-vn", "-ac", "1", "-ar", str(engine.sample_rate), dst],
        capture_output=True,
    )
    if proc.returncode != 0:
        raise RuntimeError("Could not decode this file. It may be corrupt or not audio.")
    return dst


def run_job(job: Job):
    job.status, job.started = "processing", time.time()
    decoded = None
    try:
        if job.cancel:
            raise Cancelled()
        source = job.input_path
        try:
            info = sf.info(source)
        except Exception:
            decoded = source = _to_wav_with_ffmpeg(source, job.id)
            info = sf.info(source)

        job.duration_sec = info.frames / info.samplerate
        if job.duration_sec > MAX_DURATION_MIN * 60:
            raise RuntimeError(f"Recording is longer than the {MAX_DURATION_MIN}-minute limit.")

        def progress(p):
            job.progress = p

        denoise_file(
            source, job.output_path, engine,
            atten_lim_db=job.atten_lim_db,
            chunk_seconds=CHUNK_SECONDS,
            on_progress=progress,
            should_cancel=lambda: job.cancel,
        )
        job.progress, job.status = 1.0, "done"
    except Cancelled:
        job.status = "cancelled"
        _remove(job.output_path)
    except Exception as e:  # noqa: BLE001 - surface any failure to the client
        print(f"❌ Job {job.id} failed: {e}")
        job.status, job.error = "error", str(e)
        _remove(job.output_path)
    finally:
        job.finished = time.time()
        _remove(job.input_path, decoded)


async def janitor():
    while True:
        await asyncio.sleep(60)
        now = time.time()
        for jid, j in list(jobs.items()):
            expired = j.finished and now - j.finished > JOB_TTL_SECONDS
            stale = now - j.created > JOB_TTL_SECONDS * 6
            if (expired or stale) and j.status != "processing":
                _remove(j.input_path, j.output_path)
                jobs.pop(jid, None)


@asynccontextmanager
async def lifespan(_app):
    task = asyncio.create_task(janitor())
    yield
    task.cancel()


app = FastAPI(title="Hush denoising API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])


def require_key(authorization: Optional[str] = Header(None), x_api_key: Optional[str] = Header(None)):
    if not API_KEY:
        return
    token = x_api_key
    if not token and authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:]
    if not token or not secrets.compare_digest(token, API_KEY):
        raise HTTPException(401, "Invalid or missing API key.")


def _public(j: Job):
    queued_ahead = sum(1 for o in jobs.values() if o.status == "queued" and o.created < j.created)
    end = j.finished or time.time()
    return {
        "id": j.id,
        "status": j.status,
        "progress": round(j.progress, 4),
        "error": j.error,
        "filename": j.filename,
        "duration_sec": j.duration_sec,
        "elapsed_sec": round(end - j.started, 2) if j.started else 0,
        "queue_position": queued_ahead if j.status == "queued" else 0,
    }


def _get(job_id: str) -> Job:
    j = jobs.get(job_id)
    if not j:
        raise HTTPException(404, "Job not found or expired.")
    return j


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "engine": engine.name,
        "sample_rate": engine.sample_rate,
        "max_upload_mb": MAX_UPLOAD_MB,
        "max_duration_min": MAX_DURATION_MIN,
        "chunk_seconds": CHUNK_SECONDS,
        "auth_required": bool(API_KEY),
        "formats": sorted(e.lstrip(".") for e in ALLOWED_EXT),
    }


@app.post("/api/jobs", status_code=202, dependencies=[Depends(require_key)])
async def create_job(file: UploadFile = File(...), atten_lim_db: Optional[float] = Form(None)):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, f"Unsupported format '{ext or 'unknown'}'.")
    if atten_lim_db is not None and not (0 < atten_lim_db <= 100):
        raise HTTPException(400, "atten_lim_db must be between 0 and 100.")

    job_id = uuid.uuid4().hex
    input_path = os.path.join(WORK_DIR, f"{job_id}_in{ext}")
    output_path = os.path.join(WORK_DIR, f"{job_id}_out.wav")

    limit, size = MAX_UPLOAD_MB * 1024 * 1024, 0
    try:
        with open(input_path, "wb") as buf:
            while block := await file.read(1024 * 1024):
                size += len(block)
                if size > limit:
                    raise HTTPException(413, f"File is larger than the {MAX_UPLOAD_MB} MB limit.")
                buf.write(block)
        if size == 0:
            raise HTTPException(400, "The uploaded file is empty.")
    except BaseException:
        _remove(input_path)
        raise

    # Reject over-long recordings now, while the user is still on the upload screen.
    try:
        info = sf.info(input_path)
        if info.frames / info.samplerate > MAX_DURATION_MIN * 60:
            _remove(input_path)
            raise HTTPException(413, f"Recording is longer than the {MAX_DURATION_MIN}-minute limit.")
    except HTTPException:
        raise
    except Exception:
        pass  # unknown to libsndfile; the worker will try ffmpeg

    job = Job(job_id, file.filename or f"audio{ext}", input_path, output_path, atten_lim_db)
    jobs[job_id] = job
    executor.submit(run_job, job)
    return {"id": job_id}


@app.get("/api/jobs/{job_id}", dependencies=[Depends(require_key)])
def job_status(job_id: str):
    return _public(_get(job_id))


@app.get("/api/jobs/{job_id}/audio", dependencies=[Depends(require_key)])
def job_audio(job_id: str):
    j = _get(job_id)
    if j.status != "done" or not os.path.exists(j.output_path):
        raise HTTPException(409, "The cleaned audio is not ready.")
    return FileResponse(j.output_path, media_type="audio/wav", filename="cleaned.wav")


@app.delete("/api/jobs/{job_id}", dependencies=[Depends(require_key)])
def delete_job(job_id: str):
    j = _get(job_id)
    if j.status in ("queued", "processing"):
        j.cancel = True  # worker stops at the next chunk and cleans up
        return {"ok": True, "cancelled": True}
    _remove(j.input_path, j.output_path)
    jobs.pop(job_id, None)
    return {"ok": True}
