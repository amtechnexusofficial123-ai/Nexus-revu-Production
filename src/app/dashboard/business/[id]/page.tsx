"use client";

import { useEffect, useRef, useState, use } from "react";
import { useRouter } from "next/navigation";
import { fileToLogoDataUrl } from "@/lib/logoUpload";
import { downloadQrImage, downloadQuestionsQrImage, buildQrDownloadFilename } from "@/lib/qrDownload";
import { generateQrDataUrl, QR_PREVIEW_SIZE, QR_PRINT_SIZE } from "@/lib/qr";
import { themesToText } from "@/lib/reviewThemes";
import { QrFlyerPreview } from "@/components/QrFlyerPreview";
import { QuestionsQrPreview } from "@/components/QuestionsQrPreview";

type Business = {
  id: string;
  name: string;
  address: string | null;
  category: string | null;
  description: string | null;
  reviewThemes: string[] | null;
  logoUrl: string | null;
  googlePlaceId: string | null;
  whatsappNumber: string | null;
  slug: string;
  manageToken?: string | null;
  enabled: boolean;
  billingMode: "manual" | "razorpay";
  razorpayYearlyAmount?: number | null;
  razorpaySubscriptionStatus: string | null;
  paidUntil: string | null;
};

type Tab = "details" | "questions" | "qr";

function appOrigin() {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

function urlsFromBusiness(b: { manageToken?: string | null; slug?: string | null }) {
  const origin = appOrigin();
  const token = b.manageToken?.trim();
  return {
    payUrl: token ? `${origin}/pay/${token}` : null,
    manageUrl: token ? `${origin}/q/${token}` : null,
    reviewUrl: b.slug ? `${origin}/r/${b.slug}` : null,
  };
}

export default function BusinessDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const isNew = id === "new";
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<Tab>("details");
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [questionCount, setQuestionCount] = useState(0);

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [reviewThemesText, setReviewThemesText] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [googlePlaceId, setGooglePlaceId] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [billingMode, setBillingMode] = useState<"manual" | "razorpay">("manual");
  const [razorpayYearlyAmount, setRazorpayYearlyAmount] = useState<1500 | 2500>(2500);
  const [savingDetails, setSavingDetails] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [detailsMessage, setDetailsMessage] = useState<string | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [togglingEnabled, setTogglingEnabled] = useState(false);
  const [copyFromId, setCopyFromId] = useState("");
  const [copyOptions, setCopyOptions] = useState<{ id: string; name: string }[]>([]);
  const [copyingFrom, setCopyingFrom] = useState(false);
  const [copyHint, setCopyHint] = useState<string | null>(null);

  const [reviewQrDataUrl, setReviewQrDataUrl] = useState<string | null>(null);
  const [reviewUrl, setReviewUrl] = useState<string | null>(null);
  const [manageQrDataUrl, setManageQrDataUrl] = useState<string | null>(null);
  const [manageUrl, setManageUrl] = useState<string | null>(null);
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const [copiedPayLink, setCopiedPayLink] = useState(false);
  const [downloadingReviewQr, setDownloadingReviewQr] = useState(false);
  const [downloadingQuestionsQr, setDownloadingQuestionsQr] = useState(false);
  const [backlog, setBacklog] = useState<{
    total: number;
    target: number;
    bySentiment: { positive: number; neutral: number; negative: number };
    cooldownActive: boolean;
    refillAfter: string | null;
  } | null>(null);
  const [loadingBacklog, setLoadingBacklog] = useState(false);
  const [backlogMessage, setBacklogMessage] = useState<string | null>(null);
  const [backlogError, setBacklogError] = useState<string | null>(null);

  function applyBacklogPayload(data: {
    total: number;
    target: number;
    bySentiment: { positive: number; neutral: number; negative: number };
    cooldownActive: boolean;
    refillAfter?: string | Date | null;
  }) {
    setBacklog({
      total: data.total,
      target: data.target,
      bySentiment: data.bySentiment,
      cooldownActive: data.cooldownActive,
      refillAfter: data.refillAfter ? String(data.refillAfter) : null,
    });
  }

  async function handleLoadBacklog() {
    if (isNew) return;
    setBacklogError(null);
    setBacklogMessage(null);
    setLoadingBacklog(true);
    try {
      const res = await fetch(`/api/businesses/${id}/backlog`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (data.backlog) applyBacklogPayload(data.backlog);
      if (!res.ok) {
        setBacklogError(data.error ?? "Could not load backlog reviews");
        return;
      }
      setBacklogMessage(data.message ?? "Backlog loaded.");
    } catch {
      setBacklogError("Could not load backlog reviews");
    } finally {
      setLoadingBacklog(false);
    }
  }

  useEffect(() => {
    if (!isNew) return;
    fetch("/api/businesses")
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) return;
        setCopyOptions(
          (data.businesses ?? []).map((b: { id: string; name: string }) => ({
            id: b.id,
            name: b.name,
          }))
        );
      })
      .catch(() => {
        // ignore — copy is optional
      });
  }, [isNew]);

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;

    fetch(`/api/businesses/${id}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error ?? "Failed to load");
        if (cancelled) return;
        const biz = data.business as Business;
        setBusiness(biz);
        setName(biz.name ?? "");
        setAddress(biz.address ?? "");
        setCategory(biz.category ?? "");
        setDescription(biz.description ?? "");
        setReviewThemesText(themesToText(biz.reviewThemes));
        setLogoUrl(biz.logoUrl ?? "");
        setGooglePlaceId(biz.googlePlaceId ?? "");
        setWhatsappNumber(biz.whatsappNumber ?? "");
        setBillingMode(biz.billingMode === "razorpay" ? "razorpay" : "manual");
        setRazorpayYearlyAmount(biz.razorpayYearlyAmount === 1500 ? 1500 : 2500);
        const urls = urlsFromBusiness(biz);
        setPayUrl(urls.payUrl);
        setManageUrl(urls.manageUrl);
        setReviewUrl(urls.reviewUrl);
      })
      .catch(() => {
        if (!cancelled) setDetailsError("Could not load this business. Try refreshing.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    fetch(`/api/businesses/${id}/questions`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok || cancelled) return;
        setQuestionCount((data.questions ?? []).length);
      })
      .catch(() => {
        // optional
      });

    fetch(`/api/businesses/${id}/backlog`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok || cancelled) return;
        if (data.backlog) applyBacklogPayload(data.backlog);
      })
      .catch(() => {
        // Backlog endpoint may fail before DB patch — ignore on load
      });

    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  // Rebuild preview QR when the target URL changes.
  useEffect(() => {
    setReviewQrDataUrl(null);
  }, [reviewUrl]);
  useEffect(() => {
    setManageQrDataUrl(null);
  }, [manageUrl]);

  // Fast client-side preview QRs when the relevant tab opens.
  useEffect(() => {
    if (isNew) return;
    if (tab !== "qr" && tab !== "questions") return;
    let cancelled = false;

    async function buildPreview() {
      try {
        if (tab === "qr" && reviewUrl && !reviewQrDataUrl) {
          const url = await generateQrDataUrl(reviewUrl, { width: QR_PREVIEW_SIZE });
          if (!cancelled) setReviewQrDataUrl(url);
        }
        if (tab === "questions" && manageUrl && !manageQrDataUrl) {
          const url = await generateQrDataUrl(manageUrl, { width: QR_PREVIEW_SIZE });
          if (!cancelled) setManageQrDataUrl(url);
        }
      } catch {
        if (!cancelled) setDetailsError("Could not generate QR preview. Try refreshing.");
      }
    }

    void buildPreview();
    return () => {
      cancelled = true;
    };
  }, [id, isNew, tab, reviewUrl, manageUrl, reviewQrDataUrl, manageQrDataUrl]);

  async function handleCopyFromChange(sourceId: string) {
    setCopyFromId(sourceId);
    setCopyHint(null);
    setDetailsError(null);
    if (!sourceId) return;

    setCopyingFrom(true);
    try {
      const [bizRes, qRes] = await Promise.all([
        fetch(`/api/businesses/${encodeURIComponent(sourceId)}`),
        fetch(`/api/businesses/${encodeURIComponent(sourceId)}/questions`),
      ]);
      const bizData = await bizRes.json().catch(() => ({}));
      const qData = await qRes.json().catch(() => ({}));
      if (!bizRes.ok) {
        setDetailsError(bizData.error ?? "Could not load source business");
        setCopyFromId("");
        return;
      }

      const src = bizData.business;
      setDescription(src.description ?? "");
      setReviewThemesText(themesToText(src.reviewThemes));
      if (!category.trim() && src.category) setCategory(src.category);

      const qCount = (qData.questions ?? []).length;
      setCopyHint(
        qCount > 0
          ? `Copied description and review themes. ${qCount} question${qCount === 1 ? "" : "s"} will be copied when you create this business.`
          : "Copied description and review themes. No questions to copy from that business."
      );
    } catch {
      setDetailsError("Could not load source business");
      setCopyFromId("");
    } finally {
      setCopyingFrom(false);
    }
  }

  async function handleLogoFile(file: File | null) {
    if (!file) return;
    setDetailsError(null);
    setDetailsMessage(null);
    setUploadingLogo(true);
    try {
      const dataUrl = await fileToLogoDataUrl(file);
      setLogoUrl(dataUrl);
      setDetailsMessage("Logo ready — save changes to keep it.");
    } catch (err) {
      setDetailsError(err instanceof Error ? err.message : "Could not read that image");
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSaveDetails(e: React.FormEvent) {
    e.preventDefault();
    setDetailsError(null);
    setDetailsMessage(null);
    setSavingDetails(true);

    const payload = {
      name,
      address,
      category,
      description,
      reviewThemes: reviewThemesText,
      logoUrl,
      googlePlaceId,
      whatsappNumber,
      billingMode,
      razorpayYearlyAmount: billingMode === "razorpay" ? razorpayYearlyAmount : undefined,
      ...(isNew && copyFromId ? { copyFromBusinessId: copyFromId } : {}),
    };

    if (isNew) {
      const res = await fetch("/api/businesses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setSavingDetails(false);
      if (!res.ok) {
        setDetailsError(data.error ?? "Something went wrong");
        return;
      }
      router.replace(`/dashboard/business/${data.business.id}`);
      setTab("questions");
      return;
    }

    const res = await fetch(`/api/businesses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSavingDetails(false);
    if (!res.ok) {
      setDetailsError(data.error ?? "Something went wrong");
      return;
    }
    setBusiness(data.business);
    setBillingMode(data.business.billingMode === "razorpay" ? "razorpay" : "manual");
    setRazorpayYearlyAmount(data.business.razorpayYearlyAmount === 1500 ? 1500 : 2500);
    const urls = urlsFromBusiness(data.business);
    if (urls.payUrl) setPayUrl(urls.payUrl);
    if (urls.manageUrl) setManageUrl(urls.manageUrl);
    if (urls.reviewUrl) setReviewUrl(urls.reviewUrl);
    setDetailsMessage("Saved.");
  }

  async function handleToggleEnabled() {
    if (isNew || !business || togglingEnabled) return;
    const next = !(business.enabled !== false);
    setDetailsError(null);
    setDetailsMessage(null);
    setTogglingEnabled(true);
    try {
      const res = await fetch(`/api/businesses/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDetailsError(data.error ?? "Could not update status");
        return;
      }
      setBusiness(data.business);
      setDetailsMessage(next ? "Customer QR marked enabled." : "Customer QR disabled.");
    } catch {
      setDetailsError("Could not update status");
    } finally {
      setTogglingEnabled(false);
    }
  }

  async function handleDownloadReviewQr() {
    if (!reviewUrl || !business) return;
    setDownloadingReviewQr(true);
    try {
      const hiResQr = await generateQrDataUrl(reviewUrl, { width: QR_PRINT_SIZE });
      await downloadQrImage(
        hiResQr,
        buildQrDownloadFilename(business?.name ?? name, "CustomerQR"),
        { businessName: business?.name ?? name, logoUrl: business?.logoUrl ?? logoUrl }
      );
    } catch {
      setDetailsError("Could not download QR image");
    } finally {
      setDownloadingReviewQr(false);
    }
  }

  async function handleDownloadQuestionsQr() {
    if (!manageUrl || !business) return;
    setDownloadingQuestionsQr(true);
    try {
      const hiResQr = await generateQrDataUrl(manageUrl, { width: QR_PRINT_SIZE });
      await downloadQuestionsQrImage(
        hiResQr,
        buildQrDownloadFilename(business?.name ?? name, "QuestionsQR"),
        {
          businessName: business?.name ?? name,
          logoUrl: business?.logoUrl ?? logoUrl,
        }
      );
    } catch {
      setDetailsError("Could not download QR image");
    } finally {
      setDownloadingQuestionsQr(false);
    }
  }

  if (loading) return <p className="text-ink/60">Loading…</p>;

  const tabs: { id: Tab; label: string; shortLabel: string }[] = [
    { id: "details", label: "Details", shortLabel: "Details" },
    { id: "questions", label: "Questions", shortLabel: "Questions" },
    { id: "qr", label: "Customer QR", shortLabel: "Customer" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-xl text-ink sm:text-2xl">
              {isNew ? "Add a business" : business?.name}
            </h1>
            {!isNew && business && (
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                  business.enabled !== false
                    ? "bg-emerald-50 text-emerald-800"
                    : "bg-red-50 text-red-700"
                }`}
              >
                {business.enabled !== false ? "Enabled" : "Disabled"}
              </span>
            )}
          </div>
          <p className="truncate text-sm text-ink/60">
            {isNew ? "Fill in the details, then set up their review questions." : business?.address}
          </p>
        </div>
        {!isNew && business && (
          <div className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">Customer review QR (admin)</p>
              <p className="mt-0.5 text-xs text-ink/55">
                Master switch. Off always blocks the customer QR.
                {business.billingMode === "razorpay"
                  ? " For Razorpay clients, they must also have an active paid subscription."
                  : " Manual billing: this switch alone controls the customer QR."}
              </p>
            </div>
            <button
              type="button"
              onClick={handleToggleEnabled}
              disabled={togglingEnabled}
              className={`btn-secondary w-full shrink-0 sm:w-auto ${
                business.enabled !== false ? "border-red-200 text-red-700 hover:bg-red-50" : ""
              }`}
            >
              {togglingEnabled
                ? "Updating…"
                : business.enabled !== false
                  ? "Disable"
                  : "Enable"}
            </button>
          </div>
        )}
        <div className="grid w-full grid-cols-3 gap-0.5 rounded-full bg-brand-light p-1 sm:inline-grid sm:w-auto sm:gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              disabled={t.id !== "details" && isNew}
              className={`min-h-[40px] rounded-full px-2 py-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 sm:px-4 sm:text-sm ${
                tab === t.id ? "bg-white text-ink shadow-sm" : "text-ink/60"
              }`}
            >
              <span className="sm:hidden">{t.shortLabel}</span>
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {tab === "details" && (
        <form onSubmit={handleSaveDetails} className="card flex flex-col gap-4">
          {isNew && copyOptions.length > 0 && (
            <div>
              <label className="mb-1 block text-sm font-medium text-ink/80">
                Copy from existing business
              </label>
              <select
                className="input"
                value={copyFromId}
                disabled={copyingFrom || savingDetails}
                onChange={(e) => void handleCopyFromChange(e.target.value)}
              >
                <option value="">Start blank</option>
                {copyOptions.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-ink/50">
                Copies description, review themes, and questions. Name, address, logo, and Google
                place stay new.
              </p>
              {copyingFrom && <p className="mt-2 text-sm text-ink/55">Loading…</p>}
              {copyHint && !copyingFrom && (
                <p className="mt-2 text-sm text-brand">{copyHint}</p>
              )}
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-ink/80">Billing</label>
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
              <label className="flex items-center gap-2 text-sm text-ink/80">
                <input
                  type="radio"
                  name="billingMode"
                  checked={billingMode === "manual"}
                  onChange={() => setBillingMode("manual")}
                />
                Manual payment (you enable/disable)
              </label>
              <label className="flex items-center gap-2 text-sm text-ink/80">
                <input
                  type="radio"
                  name="billingMode"
                  checked={billingMode === "razorpay"}
                  onChange={() => setBillingMode("razorpay")}
                />
                Razorpay (owner pays online)
              </label>
            </div>
            {billingMode === "razorpay" && (
              <div className="mt-3">
                <p className="mb-2 text-sm font-medium text-ink/80">Yearly amount</p>
                <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
                  <label className="flex items-center gap-2 text-sm text-ink/80">
                    <input
                      type="radio"
                      name="razorpayYearlyAmount"
                      checked={razorpayYearlyAmount === 2500}
                      onChange={() => setRazorpayYearlyAmount(2500)}
                    />
                    ₹2,500 / year
                  </label>
                  <label className="flex items-center gap-2 text-sm text-ink/80">
                    <input
                      type="radio"
                      name="razorpayYearlyAmount"
                      checked={razorpayYearlyAmount === 1500}
                      onChange={() => setRazorpayYearlyAmount(1500)}
                    />
                    ₹1,500 / year
                  </label>
                </div>
                <p className="mt-1 text-xs text-ink/50">
                  Shown on the payment link and Billing tab. Save details to apply.
                </p>
              </div>
            )}
            {!isNew && billingMode === "razorpay" && payUrl && (
              <div className="mt-3 rounded-card border border-ink/10 bg-brand-light/40 p-3">
                <p className="text-sm font-medium text-ink">Payment link</p>
                <p className="mt-0.5 text-xs text-ink/55">
                  Send this to the business owner. Payment only — no questions UI.
                </p>
                <p className="mt-2 break-all text-xs text-ink/70">{payUrl}</p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    className="btn-secondary w-full sm:w-auto"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(payUrl);
                        setCopiedPayLink(true);
                        setTimeout(() => setCopiedPayLink(false), 2000);
                      } catch {
                        setDetailsError("Could not copy link");
                      }
                    }}
                  >
                    {copiedPayLink ? "Copied" : "Copy payment link"}
                  </button>
                  <a
                    href={payUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-secondary w-full text-center sm:w-auto"
                  >
                    Open
                  </a>
                </div>
              </div>
            )}
            {!isNew && billingMode === "razorpay" && !payUrl && (
              <p className="mt-2 text-xs text-ink/50">
                Save details once if the payment link does not appear, then refresh.
              </p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink/80">Business name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink/80">Category</label>
            <input
              className="input"
              placeholder="e.g. Bakery, cake shop"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink/80">Business description</label>
            <textarea
              className="input min-h-[80px]"
              placeholder="Full context for accuracy. e.g. Neighborhood bakery known for custom cakes and weekend pastries."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
            <p className="mt-1 text-xs text-ink/50">
              Internal context for the AI. Keep it short. Do not list every product here.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink/80">Review themes</label>
            <textarea
              className="input min-h-[120px]"
              placeholder={"Custom birthday cakes\nFresh pastries\nQuick counter service"}
              value={reviewThemesText}
              onChange={(e) => setReviewThemesText(e.target.value)}
              required
            />
            <p className="mt-1 text-xs text-ink/50">
              3 to 5 short lines, one theme per line. The AI rotates through these so reviews do not all sound the same.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink/80">Address</label>
            <input
              className="input"
              placeholder="123 MG Road, Chennai"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-ink/80">Logo</label>
            <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Business logo preview"
                  className="max-h-24 w-auto max-w-[min(100%,220px)] object-contain"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-light font-display text-xl text-brand">
                  {(name || "?").charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => handleLogoFile(e.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  className="btn-secondary w-full sm:w-auto"
                  disabled={uploadingLogo}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploadingLogo ? "Uploading…" : logoUrl ? "Change logo" : "Upload logo"}
                </button>
                {logoUrl && (
                  <button
                    type="button"
                    className="btn-secondary w-full text-red-600 sm:w-auto"
                    disabled={uploadingLogo}
                    onClick={() => {
                      setLogoUrl("");
                      setDetailsMessage("Logo removed — save changes to keep it.");
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
            <p className="mt-2 text-xs text-ink/50">
              PNG, JPG, or WebP up to 5MB. We&apos;ll resize it automatically.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink/80">Google Place ID</label>
            <input
              className="input"
              placeholder="ChIJ…"
              value={googlePlaceId}
              onChange={(e) => setGooglePlaceId(e.target.value)}
              required
            />
            <p className="mt-1 text-xs text-ink/50">
              Find yours with Google&apos;s{" "}
              <a
                className="text-brand underline"
                href="https://developers.google.com/maps/documentation/places/web-service/place-id"
                target="_blank"
                rel="noreferrer"
              >
                Place ID Finder
              </a>
              .
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink/80">
              WhatsApp number (management)
            </label>
            <input
              className="input"
              placeholder="+91 98765 43210"
              value={whatsappNumber}
              onChange={(e) => setWhatsappNumber(e.target.value)}
              type="tel"
            />
            <p className="mt-1 text-xs text-ink/50">
              Optional. Include country code. If a customer&apos;s review is negative, we show a
              WhatsApp button so they can reach management directly before posting on Google.
            </p>
          </div>

          {!isNew && (
            <div className="rounded-card border border-ink/10 bg-ink/[0.02] p-4">
              <h3 className="text-sm font-medium text-ink">Fallback backlog reviews</h3>
              <p className="mt-1 text-xs leading-relaxed text-ink/55">
                Ready AI drafts used if Gemini fails. Target is {backlog?.target ?? 5} per
                business (2 positive, 1 neutral, 2 negative). Auto-refills after use; you can
                also load them here.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-xl bg-white px-3 py-2 border border-ink/8">
                  <p className="text-[11px] uppercase tracking-wide text-ink/45">Total</p>
                  <p className="mt-0.5 font-display text-xl text-ink">
                    {backlog ? `${backlog.total}/${backlog.target}` : "—"}
                  </p>
                </div>
                <div className="rounded-xl bg-white px-3 py-2 border border-ink/8">
                  <p className="text-[11px] uppercase tracking-wide text-ink/45">Positive</p>
                  <p className="mt-0.5 font-display text-xl text-ink">
                    {backlog?.bySentiment.positive ?? "—"}
                  </p>
                </div>
                <div className="rounded-xl bg-white px-3 py-2 border border-ink/8">
                  <p className="text-[11px] uppercase tracking-wide text-ink/45">Neutral</p>
                  <p className="mt-0.5 font-display text-xl text-ink">
                    {backlog?.bySentiment.neutral ?? "—"}
                  </p>
                </div>
                <div className="rounded-xl bg-white px-3 py-2 border border-ink/8">
                  <p className="text-[11px] uppercase tracking-wide text-ink/45">Negative</p>
                  <p className="mt-0.5 font-display text-xl text-ink">
                    {backlog?.bySentiment.negative ?? "—"}
                  </p>
                </div>
              </div>
              {backlog?.cooldownActive && (
                <p className="mt-2 text-xs text-ink/50">
                  Auto-refill is cooling down after an API failure
                  {backlog.refillAfter
                    ? ` until ${new Date(backlog.refillAfter).toLocaleString()}`
                    : ""}
                  . This button still forces a load.
                </p>
              )}
              {backlogError && <p className="mt-2 text-sm text-red-600">{backlogError}</p>}
              {backlogMessage && <p className="mt-2 text-sm text-brand">{backlogMessage}</p>}
              <button
                type="button"
                className="btn-secondary mt-3 w-full sm:w-auto"
                disabled={loadingBacklog}
                onClick={handleLoadBacklog}
              >
                {loadingBacklog ? "Loading backlog…" : "Load backlog reviews"}
              </button>
            </div>
          )}

          {detailsError && <p className="text-sm text-red-600">{detailsError}</p>}
          {detailsMessage && <p className="text-sm text-brand">{detailsMessage}</p>}
          <button className="btn-primary w-full sm:w-auto sm:self-start" disabled={savingDetails || uploadingLogo}>
            {savingDetails ? "Saving…" : isNew ? "Create business" : "Save changes"}
          </button>
        </form>
      )}

      {tab === "questions" && !isNew && (
        <div className="card flex flex-col items-center gap-4 text-center">
          <h2 className="font-display text-lg text-ink">Questions QR</h2>
          <p className="max-w-md text-sm text-ink/60">
            Staff scan this to add or edit review questions, logo, description, review themes, and
            management WhatsApp
            on their phone.
            {questionCount === 0
              ? " No questions yet — scanning lets them add the first one."
              : ` Currently ${questionCount} question${questionCount === 1 ? "" : "s"} saved.`}
          </p>
          <QuestionsQrPreview
            qrDataUrl={manageQrDataUrl}
            businessName={business?.name ?? name}
            logoUrl={business?.logoUrl ?? logoUrl}
          />
          {manageUrl && <p className="break-all text-xs text-ink/50">{manageUrl}</p>}
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
            {manageUrl && (
              <button
                type="button"
                onClick={handleDownloadQuestionsQr}
                disabled={downloadingQuestionsQr}
                className="btn-secondary w-full sm:w-auto"
              >
                {downloadingQuestionsQr ? "Preparing…" : "Download QR"}
              </button>
            )}
            {manageUrl && (
              <a href={manageUrl} target="_blank" rel="noreferrer" className="btn-secondary w-full sm:w-auto">
                Open editor
              </a>
            )}
          </div>
        </div>
      )}

      {tab === "qr" && !isNew && (
        <div className="card flex flex-col items-center gap-4 text-center">
          <h2 className="font-display text-lg text-ink">Customer review QR</h2>
          <p className="max-w-md text-sm text-ink/60">
            Print or display this flyer. Customers scan the code, answer a few quick questions, and
            get a review draft to post on Google.
          </p>
          <QrFlyerPreview
            qrDataUrl={reviewQrDataUrl}
            businessName={business?.name ?? name}
            logoUrl={business?.logoUrl ?? logoUrl}
          />
          {reviewUrl && <p className="break-all text-xs text-ink/50">{reviewUrl}</p>}
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
            {reviewUrl && (
              <button
                type="button"
                onClick={handleDownloadReviewQr}
                disabled={downloadingReviewQr}
                className="btn-secondary w-full sm:w-auto"
              >
                {downloadingReviewQr ? "Preparing…" : "Download flyer"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
