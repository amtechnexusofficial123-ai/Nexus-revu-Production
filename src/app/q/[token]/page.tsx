"use client";

import { useEffect, useRef, useState, use } from "react";
import {
  QuestionEditorRow,
  EMPTY_QUESTION,
  type EditableQuestion,
} from "@/components/QuestionEditor";
import { BillingPanel } from "@/components/BillingPanel";
import { needsOptions } from "@/lib/questionTypes";
import { MAX_QUESTIONS } from "@/lib/questions";
import { themesToText } from "@/lib/reviewThemes";
import { fileToLogoDataUrl } from "@/lib/logoUpload";

type Tab = "questions" | "details" | "billing";

export default function ManageQuestionsPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<Tab>("questions");
  const [businessName, setBusinessName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [questions, setQuestions] = useState<EditableQuestion[]>([]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [description, setDescription] = useState("");
  const [reviewThemesText, setReviewThemesText] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [step, setStep] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [detailsMessage, setDetailsMessage] = useState<string | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [billingMode, setBillingMode] = useState<"manual" | "razorpay">("manual");

  useEffect(() => {
    fetch(`/api/manage/${encodeURIComponent(token)}/questions`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Not found");
        setBusinessName(data.business.name);
        setLogoUrl(data.business.logoUrl ?? "");
        setDescription(data.business.description ?? "");
        setReviewThemesText(themesToText(data.business.reviewThemes));
        setWhatsappNumber(data.business.whatsappNumber ?? "");
        setBillingMode(data.business.billingMode === "razorpay" ? "razorpay" : "manual");
        const loaded = (data.questions ?? []).map(
          (q: EditableQuestion) => ({
            ...EMPTY_QUESTION,
            ...q,
            alwaysAsk: Boolean(q.alwaysAsk),
            active: q.active !== false,
          })
        );
        setQuestions(loaded);
        if (loaded.length === 0) {
          setQuestions([{ ...EMPTY_QUESTION }]);
          setExpandedIndex(0);
        }
        setStep("ready");
      })
      .catch((e) => {
        setErrorMsg(e.message ?? "Something went wrong");
        setStep("error");
      });
  }, [token]);

  function updateQuestion(index: number, updated: EditableQuestion) {
    setQuestions((qs) =>
      qs.map((q, i) => {
        if (i === index) return updated;
        if (updated.alwaysAsk && q.alwaysAsk) return { ...q, alwaysAsk: false };
        return q;
      })
    );
  }
  function removeQuestion(index: number) {
    setQuestions((qs) => qs.filter((_, i) => i !== index));
    setExpandedIndex(null);
  }
  function addQuestion() {
    if (questions.length >= MAX_QUESTIONS) return;
    setQuestions((qs) => [...qs, { ...EMPTY_QUESTION }]);
    setExpandedIndex(questions.length);
  }

  function switchTab(next: Tab) {
    setTab(next);
    setMessage(null);
    setSaveError(null);
    setDetailsMessage(null);
    setDetailsError(null);
  }

  async function handleLogoFile(file: File | null) {
    if (!file) return;
    setDetailsError(null);
    setDetailsMessage(null);
    setUploadingLogo(true);
    try {
      const dataUrl = await fileToLogoDataUrl(file);
      setLogoUrl(dataUrl);
      setDetailsMessage("Logo ready — tap Save details to keep it.");
    } catch (err) {
      setDetailsError(err instanceof Error ? err.message : "Could not read that image");
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSave() {
    setSaveError(null);
    setMessage(null);

    const cleaned = questions.filter((q) => q.text.trim());
    for (const q of cleaned) {
      if (needsOptions(q.type) && (q.options ?? []).filter((o) => o.trim()).length < 2) {
        setSaveError(`"${q.text}" needs at least 2 options before saving.`);
        return;
      }
    }

    setSaving(true);
    const res = await fetch(`/api/manage/${encodeURIComponent(token)}/questions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questions: cleaned }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setSaveError(data.error ?? "Something went wrong");
      return;
    }
    setQuestions(
      data.questions.length
        ? data.questions.map((q: EditableQuestion) => ({
            ...EMPTY_QUESTION,
            ...q,
            alwaysAsk: Boolean(q.alwaysAsk),
            active: q.active !== false,
          }))
        : [{ ...EMPTY_QUESTION }]
    );
    if (data.questions.length === 0) setExpandedIndex(0);
    setMessage(cleaned.length === 0 ? "Cleared. Add a question when you’re ready." : "Saved.");
  }

  async function handleSaveDetails(e: React.FormEvent) {
    e.preventDefault();
    setDetailsError(null);
    setDetailsMessage(null);
    setSavingDetails(true);

    const res = await fetch(`/api/manage/${encodeURIComponent(token)}/details`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description,
        reviewThemes: reviewThemesText,
        logoUrl,
        whatsappNumber,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSavingDetails(false);
    if (!res.ok) {
      setDetailsError(data.error ?? "Something went wrong");
      return;
    }
    setDescription(data.business?.description ?? description);
    setReviewThemesText(themesToText(data.business?.reviewThemes));
    setLogoUrl(data.business?.logoUrl ?? "");
    setWhatsappNumber(data.business?.whatsappNumber ?? "");
    setDetailsMessage("Saved.");
  }

  if (step === "loading") {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center px-5 text-ink/70">Loading…</main>
    );
  }
  if (step === "error") {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center px-5 text-center text-ink/70">
        {errorMsg}
      </main>
    );
  }

  const count = questions.filter((q) => q.text.trim()).length;
  const tabs: { id: Tab; label: string }[] = [
    { id: "questions", label: "Questions" },
    { id: "details", label: "Details" },
    ...(billingMode === "razorpay" ? [{ id: "billing" as const, label: "Billing" }] : []),
  ];

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col bg-[#FAF9F6]">
      <header className="sticky top-0 z-10 border-b border-ink/10 bg-[#FAF9F6]/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
        <div className="flex items-center gap-3">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-11 w-11 rounded-full object-cover" />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-light font-display text-brand">
              {businessName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-lg leading-tight text-ink">{businessName}</h1>
            <p className="text-xs text-ink/55">
              {tab === "questions"
                ? `${count} / ${MAX_QUESTIONS} questions · edit & save`
                : tab === "billing"
                  ? "Yearly Razorpay subscription"
                  : "Logo, description, themes & WhatsApp"}
            </p>
          </div>
        </div>

        <div className="mt-3 flex gap-1 rounded-xl bg-ink/[0.04] p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => switchTab(t.id)}
              className={`min-h-[40px] flex-1 rounded-lg text-sm font-medium transition ${
                tab === t.id
                  ? "bg-white text-ink shadow-sm"
                  : "text-ink/55 hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {tab === "questions" ? (
        <>
          <div className="flex-1 px-4 py-4 pb-[calc(7.5rem+env(safe-area-inset-bottom))]">
            {questions.length === 0 ? (
              <div className="rounded-2xl border border-ink/10 bg-white px-4 py-10 text-center text-sm text-ink/60">
                No questions yet. Tap Add below to create one.
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                {questions.map((q, i) => (
                  <QuestionEditorRow
                    key={i}
                    phone
                    index={i}
                    q={q}
                    expanded={expandedIndex === i}
                    onToggleExpand={() => setExpandedIndex(expandedIndex === i ? null : i)}
                    onChange={(updated) => updateQuestion(i, updated)}
                    onRemove={() => removeQuestion(i)}
                  />
                ))}
              </ul>
            )}

            {saveError && <p className="mt-3 text-sm text-red-600">{saveError}</p>}
            {message && <p className="mt-3 text-sm text-brand">{message}</p>}
          </div>

          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-ink/10 bg-white/95 px-4 pt-3 backdrop-blur pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="mx-auto flex max-w-md gap-2">
              <button
                type="button"
                onClick={addQuestion}
                disabled={questions.length >= MAX_QUESTIONS}
                className="btn-secondary min-h-[52px] flex-1 text-sm"
              >
                + Add
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="btn-primary min-h-[52px] flex-[1.4] text-sm"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </>
      ) : tab === "billing" ? (
        <BillingPanel token={token} autoLoad />
      ) : (
        <form
          onSubmit={handleSaveDetails}
          className="flex flex-1 flex-col px-4 py-4 pb-[calc(7.5rem+env(safe-area-inset-bottom))]"
        >
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-ink/10 bg-white p-4">
              <label className="mb-2 block text-xs font-medium text-ink/70">Logo</label>
              <div className="flex flex-col gap-3">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt="Business logo preview"
                    className="mx-auto max-h-24 w-auto max-w-[min(100%,220px)] object-contain"
                  />
                ) : (
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-light font-display text-xl text-brand">
                    {(businessName || "?").charAt(0).toUpperCase()}
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => handleLogoFile(e.target.files?.[0] ?? null)}
                />
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    className="btn-secondary min-h-[48px] w-full text-sm"
                    disabled={uploadingLogo || savingDetails}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploadingLogo ? "Uploading…" : logoUrl ? "Change logo" : "Upload logo"}
                  </button>
                  {logoUrl && (
                    <button
                      type="button"
                      className="btn-secondary min-h-[48px] w-full text-sm text-red-600"
                      disabled={uploadingLogo || savingDetails}
                      onClick={() => {
                        setLogoUrl("");
                        setDetailsMessage("Logo removed — tap Save details to keep it.");
                      }}
                    >
                      Remove logo
                    </button>
                  )}
                </div>
              </div>
              <p className="mt-2 text-xs text-ink/50">
                PNG, JPG, or WebP up to 5MB. We&apos;ll resize it automatically.
              </p>
            </div>

            <div className="rounded-2xl border border-ink/10 bg-white p-4">
              <label className="mb-1.5 block text-xs font-medium text-ink/70">
                Business description
              </label>
              <textarea
                className="input min-h-[120px] text-base"
                placeholder="Short background for AI reviews — what you offer, vibe, specialties."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
              <p className="mt-1.5 text-xs text-ink/50">
                Used as context for drafted reviews. Keep it short. Don&apos;t list every product.
              </p>
            </div>

            <div className="rounded-2xl border border-ink/10 bg-white p-4">
              <label className="mb-1.5 block text-xs font-medium text-ink/70">
                WhatsApp number (management)
              </label>
              <input
                className="input text-base"
                placeholder="+91 98765 43210"
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                type="tel"
              />
              <p className="mt-1.5 text-xs text-ink/50">
                Optional. Include country code. If a customer&apos;s review is negative, we show a
                WhatsApp button so they can reach management directly before posting on Google.
              </p>
            </div>

            <div className="rounded-2xl border border-ink/10 bg-white p-4">
              <label className="mb-1.5 block text-xs font-medium text-ink/70">
                Review themes
              </label>
              <textarea
                className="input min-h-[140px] text-base"
                placeholder={"Custom birthday cakes\nFresh pastries\nQuick counter service"}
                value={reviewThemesText}
                onChange={(e) => setReviewThemesText(e.target.value)}
                required
              />
              <p className="mt-1.5 text-xs text-ink/50">
                3 to 5 short lines, one theme per line. The AI rotates through these so reviews
                don&apos;t all sound the same.
              </p>
            </div>

            {detailsError && <p className="text-sm text-red-600">{detailsError}</p>}
            {detailsMessage && <p className="text-sm text-brand">{detailsMessage}</p>}
          </div>

          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-ink/10 bg-white/95 px-4 pt-3 backdrop-blur pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="mx-auto max-w-md">
              <button
                type="submit"
                disabled={savingDetails || uploadingLogo}
                className="btn-primary min-h-[52px] w-full text-sm"
              >
                {savingDetails ? "Saving…" : "Save details"}
              </button>
            </div>
          </div>
        </form>
      )}
    </main>
  );
}
