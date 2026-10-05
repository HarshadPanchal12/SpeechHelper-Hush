export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function errorFrom(res) {
  let message = `Request failed (${res.status}).`;
  try {
    const body = await res.json();
    if (body?.detail) message = typeof body.detail === "string" ? body.detail : message;
  } catch {
    /* non-JSON body */
  }
  return new ApiError(message, res.status);
}

export async function fetchHealth(signal) {
  const res = await fetch("/api/health", { cache: "no-store", signal });
  if (!res.ok) throw await errorFrom(res);
  return res.json();
}

// XMLHttpRequest, because fetch() can't report upload progress.
export function uploadJob({ file, attenLimDb, onProgress, signal }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/jobs");
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onerror = () => reject(new ApiError("Upload failed. Check your connection.", 0));
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve(xhr.response);
      const detail = xhr.response?.detail;
      reject(new ApiError(typeof detail === "string" ? detail : `Upload failed (${xhr.status}).`, xhr.status));
    };
    signal?.addEventListener("abort", () => xhr.abort());

    const body = new FormData();
    body.append("file", file);
    if (attenLimDb != null) body.append("atten_lim_db", String(attenLimDb));
    xhr.send(body);
  });
}

export async function getJob(id, signal) {
  const res = await fetch(`/api/jobs/${id}`, { cache: "no-store", signal });
  if (!res.ok) throw await errorFrom(res);
  return res.json();
}

export async function getAudio(id, signal) {
  const res = await fetch(`/api/jobs/${id}/audio`, { cache: "no-store", signal });
  if (!res.ok) throw await errorFrom(res);
  return res.blob();
}

export function deleteJob(id) {
  return fetch(`/api/jobs/${id}`, { method: "DELETE", keepalive: true }).catch(() => {});
}
