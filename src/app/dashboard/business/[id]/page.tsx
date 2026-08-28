"use client";

import { useEffect, useRef, useState, use } from "react";
import { useRouter } from "next/navigation";
import { fileToLogoDataUrl } from "@/lib/logoUpload";
import { downloadQrImage, downloadQuestionsQrImage, buildQrDownloadFilename } from "@/lib/qrDownload";
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
  slug: string;
};

type Tab = "details" | "questions" | "qr";

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
  const [savingDetails, setSavingDetails] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [detailsMessage, setDetailsMessage] = useState<string | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  const [reviewQrDataUrl, setReviewQrDataUrl] = useState<string | null>(null);
  const [reviewUrl, setReviewUrl] = useState<string | null>(null);
  const [manageQrDataUrl, setManageQrDataUrl] = useState<string | null>(null);
  const [manageUrl, setManageUrl] = useState<string | null>(null);
  const [downloadingReviewQr, setDownloadingReviewQr] = useState(false);
  const [downloadingQuestionsQr, setDownloadingQuestionsQr] = useState(false);

  useEffect(() => {
    if (isNew) return;
    fetch(`/api/businesses/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setBusiness(data.business);
        setName(data.business.name ?? "");
        setAddress(data.business.address ?? "");
        setCategory(data.business.category ?? "");
        setDescription(data.business.description ?? "");
        setReviewThemesText(themesToText(data.business.reviewThemes));
        setLogoUrl(data.business.logoUrl ?? "");
        setGooglePlaceId(data.business.googlePlaceId ?? "");
        setLoading(false);
      });
    fetch(`/api/businesses/${id}/questions`)
      .then((r) => r.json())
      .then((data) => setQuestionCount((data.questions ?? []).length));
    fetch(`/api/businesses/${id}/qr`)
      .then((r) => r.json())
      .then((data) => {
        setReviewQrDataUrl(data.reviewQrDataUrl ?? data.qrDataUrl);
        setReviewUrl(data.reviewUrl);
        setManageQrDataUrl(data.manageQrDataUrl);
        setManageUrl(data.manageUrl);
      });
  }, [id, isNew]);

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
    setDetailsMessage("Saved.");
  }

  async function handleDownloadReviewQr() {
    if (!reviewQrDataUrl || !business) return;
    setDownloadingReviewQr(true);
    try {
      await downloadQrImage(
        reviewQrDataUrl,
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
    if (!manageQrDataUrl || !business) return;
    setDownloadingQuestionsQr(true);
    try {
      await downloadQuestionsQrImage(
        manageQrDataUrl,
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
          <h1 className="font-display text-xl text-ink sm:text-2xl">
            {isNew ? "Add a business" : business?.name}
          </h1>
          <p className="truncate text-sm text-ink/60">
            {isNew ? "Fill in the details, then set up their review questions." : business?.address}
          </p>
        </div>
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
            Staff scan this to add or edit review questions on their phone.
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
            {manageQrDataUrl && (
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
            {reviewQrDataUrl && (
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
