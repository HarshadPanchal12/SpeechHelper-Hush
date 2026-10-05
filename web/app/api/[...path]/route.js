import { clerkEnabled } from "@/lib/clerk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BACKEND = (process.env.BACKEND_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

const FORWARD_REQUEST = ["content-type", "content-length", "range", "accept"];
const FORWARD_RESPONSE = [
  "content-type",
  "content-length",
  "content-disposition",
  "accept-ranges",
  "content-range",
];

async function signedIn(req) {
  if (!clerkEnabled) return true;
  const { createClerkClient } = await import("@clerk/backend");
  const clerk = createClerkClient({
    secretKey: process.env.CLERK_SECRET_KEY,
    publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  });
  const state = await clerk.authenticateRequest(req);
  return state.isSignedIn;
}

async function proxy(req, { params }) {
  if (!(await signedIn(req))) {
    return Response.json({ detail: "Sign in to use this app." }, { status: 401 });
  }

  const { path } = await params;
  const url = `${BACKEND}/api/${path.map(encodeURIComponent).join("/")}${new URL(req.url).search}`;

  const headers = new Headers();
  for (const name of FORWARD_REQUEST) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }
  // The key is added here, on the server. The browser never sees it.
  if (process.env.BACKEND_API_KEY) {
    headers.set("authorization", `Bearer ${process.env.BACKEND_API_KEY}`);
  }

  const init = { method: req.method, headers, redirect: "manual" };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = req.body; // streamed straight through, never buffered in memory
    init.duplex = "half";
  }

  let upstream;
  try {
    upstream = await fetch(url, init);
  } catch {
    return Response.json(
      { detail: "Can't reach the denoising server. Is it running?" },
      { status: 502 }
    );
  }

  const out = new Headers();
  for (const name of FORWARD_RESPONSE) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export { proxy as GET, proxy as POST, proxy as DELETE };
