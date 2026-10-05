import { Denoiser } from "@/components/denoiser";
import { Limits } from "@/components/limits";

export default function HomePage() {
  return (
    <div className="space-y-16">
      <div className="max-w-2xl space-y-5">
        <h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
          Take the noise out of your recording.
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          Upload speech, an interview or a call. Hush removes hiss, hum, traffic and keyboard
          clatter, and keeps the voice.
        </p>
      </div>

      <Denoiser />

      <div className="grid gap-12 md:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
          <p className="max-w-prose text-muted-foreground">
            Your file is processed by a DeepFilterNet model on this site&apos;s own server. It reads
            the recording in 30-second windows, so a long file needs no more memory than a short
            one. Uploads are deleted when processing finishes, and the result is deleted as soon as
            it reaches your browser. Stereo files come back as mono.
          </p>
        </section>
        <section className="space-y-3">
          <h2 className="text-2xl font-semibold tracking-tight">Limits</h2>
          <Limits />
        </section>
      </div>
    </div>
  );
}
