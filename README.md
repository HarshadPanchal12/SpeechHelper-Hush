# Hush: speech denoiser

Next.js + shadcn/ui front end, FastAPI + DeepFilterNet back end.

```
hush/
  backend/   Python server: chunked DeepFilterNet processing, job queue, optional API key
  web/       Next.js 15 app (Tailwind v4, shadcn/ui "new-york", same setup as the Splitter repo)
```

## Run it (Windows, two terminals)

**1. Backend**
```
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python download_model.py        # optional: pre-downloads the model (your existing script works)
uvicorn main:app --port 8000
```
No model yet and just want to see the UI? `set HUSH_ENGINE=dryrun` before `uvicorn` (it halves the volume instead of denoising).

**2. Web**
```
cd web
copy .env.example .env.local
npm install
npm run dev
```
Open http://localhost:3000.

## How long a file can it handle?

The old version loaded the whole file into RAM, so memory grew with length. This one reads 30-second
windows (plus 1 s of context either side), so memory stays flat. The real limits are now settings:

| Env var (backend/.env) | Default | Meaning |
|---|---|---|
| `MAX_UPLOAD_MB` | 500 | Largest upload |
| `MAX_DURATION_MIN` | 120 | Longest recording |
| `CHUNK_SECONDS` | 30 | Window size (lower = less RAM) |
| `JOB_TTL_SECONDS` | 1800 | How long finished jobs are kept if never downloaded |

Speed depends on your CPU. Your first test cleaned a 7 s clip in about 0.7 s (roughly 10x faster than
real time), so an hour of audio should take on the order of 6 to 10 minutes. Files are processed one
at a time; the rest queue and the UI shows progress.

## API keys and accounts (later)

* **Protect the backend:** set `DENOISE_API_KEY` in `backend/.env`, and the same value as
  `BACKEND_API_KEY` in `web/.env.local`. The Next.js route `/api/*` adds it on the server, so the
  browser never sees it.
* **Sign-in with Clerk:** fill `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` in
  `web/.env.local`. Leave them empty and the app runs open.
* **Hosted backend:** set `BACKEND_URL` in `web/.env.local` (and `CORS_ORIGINS` is only needed if you
  call the backend directly from a browser).

## Tests

```
cd backend
set PYTHONPATH=.
python tests/test_pipeline.py   # chunk stitching at 48k / 44.1k / 22k / 16k
python tests/test_api.py        # auth, limits, job flow, cleanup (uses the dry-run engine)
```
