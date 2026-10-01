"use client";

import { useEffect, useState } from "react";

type BusinessOption = { id: string; name: string };

type ErrorRow = {
  id: string;
  businessId: string | null;
  businessName: string | null;
  slug: string | null;
  source: string;
  message: string;
  detail: string | null;
  createdAt: string;
};

function formatIst(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

export default function ErrorsPage() {
  const [businesses, setBusinesses] = useState<BusinessOption[]>([]);
  const [errors, setErrors] = useState<ErrorRow[]>([]);
  const [businessId, setBusinessId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (businessId) params.set("businessId", businessId);
    setLoading(true);
    setError(null);
    fetch(`/api/analytics/errors?${params.toString()}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error ?? "Failed to load errors");
        setBusinesses(data.businesses ?? []);
        setErrors(data.errors ?? []);
      })
      .catch((e) => setError(e.message ?? "Failed to load errors"))
      .finally(() => setLoading(false));
  }, [businessId]);

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-xl text-ink sm:text-2xl">Errors</h1>
          <p className="mt-1 text-sm text-ink/60">
            Customer review flow failures with admin diagnostics. Times are shown in IST.
            Customers only see a short friendly message.
          </p>
        </div>
        <label className="flex w-full flex-col gap-1.5 sm:w-64">
          <span className="text-xs font-medium text-ink/60">Business</span>
          <select
            className="input"
            value={businessId}
            onChange={(e) => setBusinessId(e.target.value)}
          >
            <option value="">All businesses</option>
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <p className="rounded-card border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-ink/55">Loading…</p>
      ) : errors.length === 0 ? (
        <p className="rounded-card border border-ink/10 bg-white px-4 py-8 text-center text-sm text-ink/55">
          No errors logged yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-ink/10 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-ink/10 bg-ink/[0.02] text-xs font-medium uppercase tracking-wide text-ink/50">
              <tr>
                <th className="px-4 py-3">Time (IST)</th>
                <th className="px-4 py-3">Business</th>
                <th className="px-4 py-3">Error</th>
                <th className="px-4 py-3">Detail</th>
              </tr>
            </thead>
            <tbody>
              {errors.map((row) => (
                <tr key={row.id} className="border-b border-ink/5 last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 align-top text-ink/70">
                    {formatIst(row.createdAt)}
                  </td>
                  <td className="px-4 py-3 align-top text-ink/70">
                    {row.businessName ?? row.slug ?? "—"}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <p className="font-medium text-ink">{row.message}</p>
                    <p className="mt-0.5 text-xs text-ink/45">{row.source}</p>
                  </td>
                  <td className="max-w-md px-4 py-3 align-top">
                    {row.detail ? (
                      <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-ink/65">
                        {row.detail}
                      </pre>
                    ) : (
                      <span className="text-ink/40">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
