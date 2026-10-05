# Hush — Production Deployment Guide

This repository contains two services:

- `web/` — Next.js 15 frontend, deployed to Vercel.
- `backend/` — FastAPI + DeepFilterNet inference server, deployed as a Docker Web Service on Render.

Recommended production topology:

```text
Browser
   |
   v
Vercel / Next.js
   |
   | BACKEND_URL + server-side BACKEND_API_KEY
   v
Render / FastAPI
   |
   v
DeepFilterNet + FFmpeg
```

## 1. Push to GitHub

From the `hush` directory:

```bash
git init
git add .
git commit -m "Initial Hush deployment"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/hush-speech-denoiser.git
git push -u origin main
```

Do not commit `.env`, `.env.local`, API keys, or other secrets.

## 2. Deploy backend to Render

Create a new Render Web Service from the GitHub repository.

Recommended settings:

- Runtime: **Docker**
- Root Directory: `backend`
- Dockerfile: `Dockerfile`
- Docker Context: `backend`
- Health Check Path: `/api/health`

The repository also contains `render.yaml` as a starting point for a Render Blueprint.

Set these environment variables in Render:

```text
DENOISE_API_KEY=<long random secret>
CORS_ORIGINS=https://YOUR-VERCEL-DOMAIN.vercel.app
MAX_UPLOAD_MB=500
MAX_DURATION_MIN=120
CHUNK_SECONDS=30
JOB_TTL_SECONDS=1800
HUSH_ENGINE=deepfilternet
```

Render provides the public service URL, for example:

```text
https://hush-denoiser-api.onrender.com
```

Test:

```text
https://hush-denoiser-api.onrender.com/api/health
```

It should return JSON with `"ok": true`.

## 3. Deploy frontend to Vercel

Import the GitHub repository into Vercel.

Set:

```text
Root Directory = web
Framework = Next.js
```

Add these Vercel environment variables:

```text
BACKEND_URL=https://hush-denoiser-api.onrender.com
BACKEND_API_KEY=<same value as DENOISE_API_KEY>
```

Optional Clerk variables can also be added if authentication is enabled:

```text
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
```

Redeploy after changing environment variables.

## 4. Why BACKEND_URL is not NEXT_PUBLIC_BACKEND_URL

The current Next.js API route proxies requests to the Python backend:

```text
Browser -> /api/... -> Next.js -> FastAPI
```

`BACKEND_URL` and `BACKEND_API_KEY` therefore remain server-side.

Do not rename them to `NEXT_PUBLIC_*`, because Next.js exposes `NEXT_PUBLIC_*` values to browser code.

## 5. Important Vercel upload limitation

The current application uses the Next.js `/api/[...path]` route as a proxy. Vercel Functions currently have a **4.5 MB request/response body limit**.

That means:

- small audio files can use the current Vercel proxy architecture;
- a 500 MB upload is supported by the FastAPI backend itself, but **cannot pass through the Vercel Function proxy as one request**;
- large production uploads should eventually be moved to a direct-upload architecture (for example object storage/client uploads), with the backend processing the stored file.

This is a deployment limitation, not a DeepFilterNet limitation.

For the initial project/demo deployment, test with a small WAV/MP3 file below the Vercel function payload limit.

## 6. Local production-style test

Backend:

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
# source .venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

Frontend:

```bash
cd web
npm install
npm run build
npm start
```

Create `web/.env.local`:

```env
BACKEND_URL=http://127.0.0.1:8000
BACKEND_API_KEY=
```

## 7. Automatic deployments

After GitHub is connected:

- Vercel can automatically create/deploy the Next.js project from Git pushes.
- Render can automatically deploy the backend from pushes to the connected branch.

Typical workflow:

```bash
git add .
git commit -m "Update denoising UI"
git push
```

Then both connected services can rebuild from the new commit.

## 8. Troubleshooting

### Vercel shows a backend connection error

Check:

```text
BACKEND_URL
```

It must be the Render URL, not:

```text
http://127.0.0.1:8000
```

### Backend returns 401

Make sure:

```text
Render DENOISE_API_KEY
=
Vercel BACKEND_API_KEY
```

### Backend health works but uploads fail

Check the Vercel 4.5 MB request limit first. For larger files, direct upload/storage is required.

### MP3/M4A/etc. fails

The backend Docker image installs FFmpeg. Check the Render build logs and container logs.

### Render container fails during startup

DeepFilterNet/PyTorch can take time and memory to install/load. Check the Render build/runtime logs and choose a compute plan appropriate for the model.

## 9. Security checklist

- Never commit real `.env` files.
- Never put `BACKEND_API_KEY` in a `NEXT_PUBLIC_*` variable.
- Use a long random `DENOISE_API_KEY`.
- Restrict `CORS_ORIGINS` to the actual frontend origin if the backend is called directly by browsers.
- Do not expose internal server paths or secrets in error messages.

## 10. Recommended next production improvement

For files larger than the Vercel Function payload limit, change the upload flow to:

```text
Browser
   |
   | direct upload
   v
Object Storage
   |
   | job reference
   v
FastAPI / DeepFilterNet
   |
   v
Cleaned audio in storage
   |
   v
Browser download
```

That keeps Vercel as the frontend/API-control layer while avoiding large media payloads through a serverless function.
