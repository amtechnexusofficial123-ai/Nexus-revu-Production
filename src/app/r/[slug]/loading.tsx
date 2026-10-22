export default function Loading() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center px-4 py-8 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] text-center text-ink/70 sm:px-6">
      <div className="card flex w-full max-w-sm flex-col items-center gap-3 py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand/25 border-t-brand" aria-hidden />
        <p className="font-medium text-ink">Loading questions…</p>
      </div>
    </main>
  );
}
