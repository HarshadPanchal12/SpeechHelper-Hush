import "@fontsource-variable/public-sans";
import "@fontsource-variable/bricolage-grotesque";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "@/components/ui/sonner";
import { SiteHeader } from "@/components/site-header";
import { HealthProvider } from "@/components/health-provider";
import { clerkEnabled } from "@/lib/clerk";

export const metadata = {
  title: "Hush: remove background noise from speech",
  description:
    "Upload a recording and get back clean speech. Runs on your own DeepFilterNet server.",
};

export default function RootLayout({ children }) {
  const page = (
    <html lang="en">
      <body>
        <HealthProvider>
          <SiteHeader />
          <main className="mx-auto w-full max-w-6xl px-5 pb-24 pt-10 sm:px-8 sm:pt-16">
            {children}
          </main>
        </HealthProvider>
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
  return clerkEnabled ? <ClerkProvider>{page}</ClerkProvider> : page;
}
