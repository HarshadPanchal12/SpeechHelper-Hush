import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const clerkEnabled = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
);

const isPublic = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);

// Without Clerk keys the app is open. With keys, every page needs a session.
export default clerkEnabled
  ? clerkMiddleware(async (auth, req) => {
      if (!isPublic(req)) await auth.protect();
    })
  : () => NextResponse.next();

// /api is excluded on purpose: middleware buffers request bodies (10 MB cap), which
// would truncate audio uploads. The proxy route checks the session itself.
export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
