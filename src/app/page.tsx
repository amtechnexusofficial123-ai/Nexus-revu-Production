import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col items-center justify-center px-4 py-10 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))] text-center sm:px-6">
      <img src="/nexusrevu-mark.svg" alt="NexusRevu" className="mb-4 h-12 w-12 sm:h-14 sm:w-14" />
      <p className="mb-3 font-body text-xs uppercase tracking-widest text-brand sm:text-sm">
        Table-side reviews
      </p>
      <h1 className="font-display text-3xl leading-tight text-ink sm:text-5xl">
        A tap. Three questions.
        <br />A review worth reading.
      </h1>
      <p className="mt-5 max-w-xl font-body text-sm text-ink/70 sm:text-base">
        Put a QR on the table. Customers answer a few quick questions, stars,
        picks, or a short note. They get a draft review and paste it on Google.
      </p>
      <div className="mt-8 flex w-full max-w-sm flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
        <Link href="/signup" className="btn-primary w-full sm:w-auto">
          Set up your business
        </Link>
        <Link href="/login" className="btn-secondary w-full sm:w-auto">
          Log in
        </Link>
      </div>
    </main>
  );
}
