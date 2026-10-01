"use client";

import { use, useEffect, useState } from "react";
import { BillingPanel } from "@/components/BillingPanel";

export default function PayOnlyPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [businessName, setBusinessName] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/manage/${encodeURIComponent(token)}/billing`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error ?? "Not found");
        if (data.billingMode !== "razorpay") {
          throw new Error("Online payment is not enabled for this business");
        }
        if (cancelled) return;
        setBusinessName(data.businessName ?? "");
        setReady(true);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Something went wrong");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loadError) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-4 py-10">
        <p className="text-center text-sm text-red-600">{loadError}</p>
      </main>
    );
  }

  if (!ready) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-4 py-10">
        <p className="text-sm text-ink/55">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col bg-[#FAF9F6]">
      <header className="flex items-center gap-3 border-b border-ink/10 px-4 py-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-light font-display text-brand">
          {(businessName || "?").charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{businessName || "NexusRevu"}</p>
          <p className="text-xs text-ink/55">Yearly subscription payment</p>
        </div>
      </header>
      <BillingPanel token={token} autoLoad />
    </main>
  );
}
