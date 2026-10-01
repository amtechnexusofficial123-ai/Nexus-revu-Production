"use client";

import { useEffect, useMemo, useState } from "react";

type BusinessOption = { id: string; name: string };

type SummaryRow = {
  businessId: string;
  businessName: string;
  drafts: number;
  posts: number;
  whatsapp: number;
};

type SessionRow = {
  id: string;
  businessId: string;
  businessName: string;
  draftText: string | null;
  sentiment: string | null;
  answers: Record<string, string> | null;
  postedAt: string | null;
  whatsappClickedAt: string | null;
  createdAt: string;
};

function formatWhen(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function SentimentBadge({ sentiment }: { sentiment: string | null }) {
  const label = sentiment ?? "unknown";
  const styles =
    label === "positive"
      ? "bg-emerald-50 text-emerald-800"
      : label === "negative"
        ? "bg-red-50 text-red-700"
        : "bg-ink/5 text-ink/70";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${styles}`}>
      {label}
    </span>
  );
}

export default function ActivityPage() {
  const [businesses, setBusinesses] = useState<BusinessOption[]>([]);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [businessId, setBusinessId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (businessId) params.set("businessId", businessId);
    setLoading(true);
    setError(null);
    fetch(`/api/analytics/sessions?${params.toString()}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error ?? "Failed to load activity");
        setBusinesses(data.businesses ?? []);
        setSummary(data.summary ?? []);
        setSessions(data.sessions ?? []);
      })
      .catch((e) => setError(e.message ?? "Failed to load activity"))
      .finally(() => setLoading(false));
  }, [businessId]);

  const totals = useMemo(() => {
    return summary.reduce(
      (acc, row) => ({
        drafts: acc.drafts + Number(row.drafts || 0),
        posts: acc.posts + Number(row.posts || 0),
        whatsapp: acc.whatsapp + Number(row.whatsapp || 0),
      }),
      { drafts: 0, posts: 0, whatsapp: 0 }
    );
  }, [summary]);

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-xl text-ink sm:text-2xl">Activity</h1>
          <p className="mt-1 text-sm text-ink/60">
            Drafts generated for your businesses, plus Post and WhatsApp clicks.
            Post means they opened Google — not that they finished submitting.
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="card">
          <p className="text-xs font-medium uppercase tracking-wide text-ink/50">Drafts</p>
          <p className="mt-2 font-display text-3xl text-ink">{loading ? "…" : totals.drafts}</p>
        </div>
        <div className="card">
          <p className="text-xs font-medium uppercase tracking-wide text-ink/50">Post clicked</p>
          <p className="mt-2 font-display text-3xl text-ink">{loading ? "…" : totals.posts}</p>
        </div>
        <div className="card">
          <p className="text-xs font-medium uppercase tracking-wide text-ink/50">WhatsApp clicked</p>
          <p className="mt-2 font-display text-3xl text-ink">{loading ? "…" : totals.whatsapp}</p>
        </div>
      </div>

      {!businessId && summary.length > 0 && (
        <div className="card overflow-x-auto">
          <h2 className="mb-4 font-display text-lg text-ink">By business</h2>
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-xs uppercase tracking-wide text-ink/50">
                <th className="pb-2 pr-4 font-medium">Business</th>
                <th className="pb-2 pr-4 font-medium">Drafts</th>
                <th className="pb-2 pr-4 font-medium">Post</th>
                <th className="pb-2 font-medium">WhatsApp</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((row) => (
                <tr key={row.businessId} className="border-b border-ink/5 last:border-0">
                  <td className="py-3 pr-4 font-medium text-ink">{row.businessName}</td>
                  <td className="py-3 pr-4 text-ink/80">{row.drafts}</td>
                  <td className="py-3 pr-4 text-ink/80">{row.posts}</td>
                  <td className="py-3 text-ink/80">{row.whatsapp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="font-display text-lg text-ink">Recent drafts</h2>
        {loading ? (
          <p className="text-sm text-ink/55">Loading…</p>
        ) : sessions.length === 0 ? (
          <p className="rounded-card border border-ink/10 bg-white px-4 py-8 text-center text-sm text-ink/55">
            No drafts yet{businessId ? " for this business" : ""}.
          </p>
        ) : (
          sessions.map((session) => (
            <article key={session.id} className="card flex flex-col gap-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{session.businessName}</p>
                  <p className="mt-0.5 text-xs text-ink/50">{formatWhen(session.createdAt)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <SentimentBadge sentiment={session.sentiment} />
                  {session.postedAt ? (
                    <span className="rounded-full bg-brand-light px-2 py-0.5 text-[11px] font-medium text-brand">
                      Post · {formatWhen(session.postedAt)}
                    </span>
                  ) : (
                    <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[11px] font-medium text-ink/45">
                      No post click
                    </span>
                  )}
                  {session.whatsappClickedAt ? (
                    <span className="rounded-full bg-[#e8f8ee] px-2 py-0.5 text-[11px] font-medium text-[#1a7a3c]">
                      WhatsApp · {formatWhen(session.whatsappClickedAt)}
                    </span>
                  ) : null}
                </div>
              </div>
              <p className="rounded-card bg-brand-light/60 px-3 py-3 text-sm leading-relaxed text-ink">
                {session.draftText?.trim() || <span className="text-ink/40">Empty draft</span>}
              </p>
              {session.answers && Object.keys(session.answers).length > 0 && (
                <details className="text-xs text-ink/55">
                  <summary className="cursor-pointer select-none font-medium text-ink/65">
                    Answers
                  </summary>
                  <ul className="mt-2 list-disc space-y-1 pl-4">
                    {Object.values(session.answers).map((answer, i) => (
                      <li key={`${session.id}-${i}`}>{answer}</li>
                    ))}
                  </ul>
                </details>
              )}
            </article>
          ))
        )}
      </div>
    </div>
  );
}
