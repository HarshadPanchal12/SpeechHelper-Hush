import Link from "next/link";
import { clerkEnabled } from "@/lib/clerk";
import { AuthControls } from "@/components/auth-controls";
import { BackendStatus } from "@/components/backend-status";

function Mark() {
  // Jagged on the left, smooth on the right: noise turning into signal.
  return (
    <svg width="28" height="20" viewBox="0 0 28 20" aria-hidden>
      <g strokeWidth="2.2" strokeLinecap="round">
        <path d="M3 10v0M7 6v8M11 3v14" className="stroke-noise" />
        <path d="M15 5v10M19 7v6M23 9v2" className="stroke-primary" />
      </g>
    </svg>
  );
}

export function SiteHeader() {
  return (
    <header className="border-b bg-background/90">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2.5 font-display text-xl font-semibold tracking-tight">
            <Mark />
            Hush
          </Link>
          <div className="flex items-center gap-5 text-sm font-medium text-muted-foreground">
            <Link href="/" className="hover:text-foreground">
              Clean audio
            </Link>
            <Link href="/history" className="hover:text-foreground">
              History
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <BackendStatus />
          {clerkEnabled && <AuthControls />}
        </div>
      </nav>
    </header>
  );
}
