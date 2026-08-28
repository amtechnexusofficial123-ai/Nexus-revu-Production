"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Business = {
  id: string;
  name: string;
  address: string | null;
  logoUrl: string | null;
};

type DeleteStep = "confirm" | "typeYes";

export default function HomePage() {
  const router = useRouter();
  const [businesses, setBusinesses] = useState<Business[] | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Business | null>(null);
  const [deleteStep, setDeleteStep] = useState<DeleteStep>("confirm");
  const [confirmText, setConfirmText] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/businesses")
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error ?? "Failed to load businesses");
        setBusinesses(data.businesses ?? []);
      })
      .catch(() => setBusinesses([]));
  }, []);

  function openDelete(business: Business, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setPendingDelete(business);
    setDeleteStep("confirm");
    setConfirmText("");
    setDeleteError(null);
  }

  function closeDelete() {
    if (deletingId) return;
    setPendingDelete(null);
    setDeleteStep("confirm");
    setConfirmText("");
    setDeleteError(null);
  }

  async function performDelete() {
    if (!pendingDelete || confirmText !== "Yes") return;

    setDeletingId(pendingDelete.id);
    setDeleteError(null);
    const res = await fetch(`/api/businesses/${pendingDelete.id}`, { method: "DELETE" });
    setDeletingId(null);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setDeleteError(data.error ?? "Could not delete business");
      return;
    }

    const id = pendingDelete.id;
    setPendingDelete(null);
    setDeleteStep("confirm");
    setConfirmText("");
    setBusinesses((list) => (list ?? []).filter((b) => b.id !== id));
  }

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-xl text-ink sm:text-2xl">Your businesses</h1>
          <p className="mt-1 text-sm text-ink/60">
            Every client you've set up with a review QR lives here.
          </p>
        </div>
        <button
          onClick={() => router.push("/dashboard/business/new")}
          className="btn-primary w-full shrink-0 sm:w-auto"
        >
          + Add business
        </button>
      </div>

      {businesses === null ? (
        <p className="text-ink/60">Loading…</p>
      ) : businesses.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-ink/70">No businesses yet.</p>
          <button
            onClick={() => router.push("/dashboard/business/new")}
            className="btn-primary w-full sm:w-auto"
          >
            + Add your first business
          </button>
        </div>
      ) : (
        <ul className="flex flex-col gap-3 sm:grid sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {businesses.map((b) => (
            <li
              key={b.id}
              className="relative overflow-hidden rounded-card border border-ink/10 bg-white shadow-sm transition hover:border-brand/40 hover:shadow-md"
            >
              <Link
                href={`/dashboard/business/${b.id}`}
                className="flex min-h-[72px] items-center gap-3 p-4 pr-14 active:bg-ink/[0.03]"
              >
                {b.logoUrl ? (
                  <img
                    src={b.logoUrl}
                    alt=""
                    className="h-11 w-11 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-light font-display text-brand">
                    {b.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-snug text-ink">{b.name}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-ink/55 sm:truncate">
                    {b.address || "No address set"}
                  </p>
                </div>
              </Link>
              <button
                type="button"
                onClick={(e) => openDelete(b, e)}
                disabled={deletingId === b.id}
                className="absolute right-1 top-1/2 flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded-lg text-ink/45 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                aria-label={`Delete ${b.name}`}
                title="Delete business"
              >
                <TrashIcon className="h-5 w-5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center"
          onClick={closeDelete}
        >
          <div
            className="card w-full max-w-md shadow-lg sm:max-h-[90dvh] sm:overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
          >
            {deleteStep === "confirm" ? (
              <>
                <h2 id="delete-dialog-title" className="font-display text-xl text-ink">
                  Delete “{pendingDelete.name}”?
                </h2>
                <p className="mt-2 text-sm text-ink/65">
                  Its QR links will stop working, and questions and review history will be removed.
                  This can’t be undone.
                </p>
                <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button type="button" onClick={closeDelete} className="btn-secondary w-full sm:w-auto">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteStep("typeYes")}
                    className="inline-flex min-h-[44px] w-full items-center justify-center rounded-card bg-red-600 px-5 py-3 font-body text-sm font-semibold text-white transition hover:bg-red-700 sm:w-auto"
                  >
                    Yes
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 id="delete-dialog-title" className="font-display text-xl text-ink">
                  Type Yes to confirm
                </h2>
                <p className="mt-2 text-sm text-ink/65">
                  Type <span className="font-semibold text-ink">Yes</span> below to permanently
                  delete “{pendingDelete.name}”.
                </p>
                <input
                  className="input mt-4"
                  autoFocus
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="Yes"
                  aria-label="Type Yes to confirm deletion"
                />
                {deleteError && <p className="mt-3 text-sm text-red-600">{deleteError}</p>}
                <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={closeDelete}
                    className="btn-secondary w-full sm:w-auto"
                    disabled={!!deletingId}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={performDelete}
                    disabled={confirmText !== "Yes" || !!deletingId}
                    className="inline-flex min-h-[44px] w-full items-center justify-center rounded-card bg-red-600 px-5 py-3 font-body text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50 sm:w-auto"
                  >
                    {deletingId ? "Deleting…" : "Delete permanently"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}
