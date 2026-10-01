"use client";

import { useEffect, useState, use } from "react";
import type { QuestionType } from "@/lib/questionTypes";

type Question = { id: string; text: string; type: QuestionType; options: string[] | null };
type BusinessInfo = { name: string; logoUrl: string | null; slug: string };

function reportClientError(
  slug: string,
  source: string,
  message: string,
  detail?: Record<string, string | number | boolean | null | undefined> | string
) {
  void fetch("/api/review/errors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug, source, message, detail }),
    keepalive: true,
  }).catch(() => {
    // Reporting must never block the customer
  });
}

export default function CustomerReviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const [business, setBusiness] = useState<BusinessInfo | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const [step, setStep] = useState<"loading" | "answering" | "drafting" | "done" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [draft, setDraft] = useState("");
  const [sentiment, setSentiment] = useState<"positive" | "neutral" | "negative" | null>(null);
  const [googleUrl, setGoogleUrl] = useState<string | null>(null);
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [loadKey, setLoadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadQuestions(attempt = 1): Promise<void> {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      try {
        const r = await fetch(`/api/review/questions?slug=${encodeURIComponent(slug)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const raw = await r.text();
        let data: {
          error?: string;
          business?: BusinessInfo;
          questions?: Question[];
        };
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch {
          if (attempt < 4) {
            await new Promise((resolve) => setTimeout(resolve, 350 * attempt));
            if (cancelled) return;
            return loadQuestions(attempt + 1);
          }
          const message = "Could not load this review page. Please try again.";
          setErrorMsg(message);
          setStep("error");
          reportClientError(slug, "review_questions_client", message, {
            stage: "parse_questions",
            attempt,
            httpStatus: r.status,
            bodyBytes: raw.length,
            bodyPreview: raw.slice(0, 240).replace(/\s+/g, " "),
          });
          return;
        }
        if (!r.ok) {
          // Transient DB/cold-start failures — retry a few times on mobile networks.
          if (r.status >= 500 && attempt < 4) {
            await new Promise((resolve) => setTimeout(resolve, 350 * attempt));
            if (cancelled) return;
            return loadQuestions(attempt + 1);
          }
          const message = data.error || "Could not load this review page.";
          setErrorMsg(message);
          setStep("error");
          reportClientError(slug, "review_questions_client", message, {
            stage: "questions_http_error",
            attempt,
            httpStatus: r.status,
            apiError: data.error ?? null,
            bodyBytes: raw.length,
            bodyPreview: raw.slice(0, 240).replace(/\s+/g, " "),
          });
          return;
        }
        if (!data.questions?.length) {
          const message = data.error || "This business hasn't set up any questions yet";
          setErrorMsg(message);
          setStep("error");
          reportClientError(slug, "review_questions_client", message, {
            stage: "empty_questions",
            attempt,
            httpStatus: r.status,
            apiError: data.error ?? null,
            questionCount: Array.isArray(data.questions) ? data.questions.length : -1,
          });
          return;
        }
        if (cancelled) return;
        setBusiness(data.business ?? null);
        setQuestions(data.questions);
        setErrorMsg("");
        setStep("answering");
      } catch (e) {
        if (cancelled) return;
        const aborted = e instanceof Error && e.name === "AbortError";
        if (aborted && attempt < 4) {
          await new Promise((resolve) => setTimeout(resolve, 350 * attempt));
          if (cancelled) return;
          return loadQuestions(attempt + 1);
        }
        const message =
          e instanceof Error && e.message && !/JSON|Unexpected|Unterminated|Failed to fetch|NetworkError|abort/i.test(e.message)
            ? e.message
            : "Could not load this review page. Please try again.";
        setErrorMsg(message);
        setStep("error");
        reportClientError(slug, "review_questions_client", message, {
          stage: aborted ? "questions_timeout" : "questions_exception",
          attempt,
          errorName: e instanceof Error ? e.name : "unknown",
          errorMessage: e instanceof Error ? e.message : String(e),
        });
      } finally {
        clearTimeout(timeoutId);
      }
    }

    setStep("loading");
    void loadQuestions();
    return () => {
      cancelled = true;
    };
  }, [slug, loadKey]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStep("drafting");
    setErrorMsg("");

    const payload = {
      slug,
      answers: questions.map((q) => ({
        questionId: q.id,
        question: q.text,
        type: q.type,
        answer: answers[q.id] ?? "",
      })),
    };

    async function requestDraft(attempt: number): Promise<void> {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 50000);
      try {
        const res = await fetch("/api/review/draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify(payload),
        });

        const raw = await res.text();
        let data: {
          error?: string;
          draftText?: string;
          sentiment?: "positive" | "neutral" | "negative" | null;
          googleUrl?: string | null;
          whatsappUrl?: string | null;
          sessionId?: string | null;
        } = {};
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch {
          if ((res.status === 502 || res.status === 503 || res.status === 504) && attempt < 3) {
            await new Promise((r) => setTimeout(r, 500 * attempt));
            return requestDraft(attempt + 1);
          }
          const message = "We couldn't write a review this time. Please try again.";
          setErrorMsg(message);
          setStep("error");
          reportClientError(slug, "review_draft_client", message, {
            stage: "draft_invalid_json",
            attempt,
            httpStatus: res.status,
            bodyBytes: raw.length,
            bodyPreview: raw.slice(0, 240).replace(/\s+/g, " "),
            likelyCloudflareKill: res.status === 502 || res.status === 503 || res.status === 504,
          });
          return;
        }

        if (!res.ok) {
          if ((res.status === 502 || res.status === 503 || res.status === 504) && attempt < 3) {
            await new Promise((r) => setTimeout(r, 500 * attempt));
            return requestDraft(attempt + 1);
          }
          const message = data.error ?? "Something went wrong";
          setErrorMsg(message);
          setStep("error");
          reportClientError(slug, "review_draft_client", message, {
            stage: "draft_http_error",
            attempt,
            httpStatus: res.status,
            apiError: data.error ?? null,
            bodyBytes: raw.length,
            bodyPreview: raw.slice(0, 240).replace(/\s+/g, " "),
            likelyCloudflareKill: res.status === 502 || res.status === 503 || res.status === 504,
          });
          return;
        }
        if (!data.draftText?.trim()) {
          const message = "We couldn't write a review this time. Please try again.";
          setErrorMsg(message);
          setStep("error");
          reportClientError(slug, "review_draft_client", message, {
            stage: "draft_empty",
            attempt,
            httpStatus: res.status,
            keys: Object.keys(data).join(","),
          });
          return;
        }
        setDraft(data.draftText);
        setSentiment(data.sentiment ?? null);
        setGoogleUrl(data.googleUrl ?? null);
        setWhatsappUrl(data.whatsappUrl ?? null);
        setSessionId(data.sessionId ?? null);
        setStep("done");
      } catch (err) {
        const aborted = err instanceof Error && err.name === "AbortError";
        if (!aborted && attempt < 3) {
          await new Promise((r) => setTimeout(r, 500 * attempt));
          return requestDraft(attempt + 1);
        }
        const message = aborted
          ? "This is taking too long. Please try again."
          : "Something went wrong. Please try again.";
        setErrorMsg(message);
        setStep("error");
        reportClientError(slug, "review_draft_client", message, {
          stage: aborted ? "draft_client_timeout" : "draft_exception",
          attempt,
          errorName: err instanceof Error ? err.name : "unknown",
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      } finally {
        clearTimeout(timeoutId);
      }
    }

    await requestDraft(1);
  }

  function trackAction(action: "post" | "whatsapp") {
    if (!sessionId) return;
    void fetch(`/api/review/session/${sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
      keepalive: true,
    }).catch(() => {
      // Tracking is best-effort — don't block the customer flow
    });
  }

  async function handlePost() {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
    } catch {
      // clipboard can fail on non-https/local — the text is still shown for manual copy
    }
    trackAction("post");
    if (googleUrl) window.open(googleUrl, "_blank");
  }

  async function handleGoogleReview() {
    try {
      await navigator.clipboard.writeText(draft);
    } catch {
      // clipboard can fail — customer can still copy from the draft box
    }
    trackAction("post");
    if (googleUrl) window.open(googleUrl, "_blank");
  }

  function handleWhatsAppClick() {
    trackAction("whatsapp");
  }

  const showWhatsAppPath = sentiment === "negative" && whatsappUrl;

  if (step === "loading") return <Centered>Loading…</Centered>;
  if (step === "error") {
    return (
      <Centered>
        <div className="flex max-w-sm flex-col items-center gap-4">
          <p>{errorMsg || "Could not load this review page. Please try again."}</p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setErrorMsg("");
              setStep("loading");
              setLoadKey((k) => k + 1);
            }}
          >
            Try again
          </button>
        </div>
      </Centered>
    );
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center px-4 py-8 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-12">
      <div className="mb-6 flex flex-col items-center text-center">
        {business?.logoUrl && (
          <img
            src={business.logoUrl}
            alt={business.name}
            className="mb-3 max-h-20 w-auto max-w-[min(100%,240px)] object-contain"
          />
        )}
        <h1 className="font-display text-2xl text-ink">{business?.name}</h1>
        <p className="mt-1 text-sm text-ink/60">Thank you for reviewing, this helps us grow.</p>
      </div>

      {step === "drafting" && (
        <div className="card flex flex-col items-center gap-3 py-12 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand/25 border-t-brand" aria-hidden />
          <p className="font-medium text-ink">Writing your review…</p>
          <p className="text-sm text-ink/55">This usually takes a few seconds.</p>
        </div>
      )}

      {step === "answering" && (
        <form onSubmit={handleSubmit} className="card flex flex-col gap-5">
          {questions.map((q, i) => (
            <div key={q.id}>
              <label className="mb-2 block text-sm font-medium text-ink/80">
                {i + 1}. {q.text}
              </label>
              <QuestionInput
                question={q}
                value={answers[q.id]}
                onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
              />
            </div>
          ))}
          <button type="submit" className="btn-primary">Continue</button>
        </form>
      )}

      {step === "done" && showWhatsAppPath ? (
        <>
          <div className="card flex flex-col gap-5">
            <div className="text-center">
              <p className="font-medium text-ink">We&apos;re sorry things didn&apos;t go well.</p>
              <p className="mt-2 text-sm leading-relaxed text-ink/70">
                We take this seriously and would love it if you could give us a chance to make
                things right.
              </p>
            </div>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleWhatsAppClick}
              className="inline-flex min-h-[48px] items-center justify-center gap-2.5 rounded-card bg-[#25D366] px-5 py-3.5 font-body text-sm font-semibold text-white shadow-sm transition hover:bg-[#1ebe57] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25D366]"
            >
              <WhatsAppIcon />
              Message management privately
            </a>
          </div>

          <div className="mt-10 flex flex-col gap-3 pt-2">
            <p className="text-center text-[11px] leading-relaxed text-ink/45">
              You can also post your review directly on Google if you prefer.
            </p>
            <p className="rounded-card border border-ink/8 bg-white/60 px-3 py-3 text-xs leading-relaxed text-ink/60">
              {draft}
            </p>
            {googleUrl ? (
              <button
                type="button"
                onClick={handleGoogleReview}
                className="w-full text-center text-[11px] font-medium text-ink/45 underline decoration-ink/20 underline-offset-2 hover:text-ink/60 hover:decoration-ink/35"
              >
                Open Google review
              </button>
            ) : (
              <p className="text-center text-[11px] text-ink/35">
                This business hasn&apos;t connected their Google listing yet.
              </p>
            )}
          </div>
        </>
      ) : step === "done" ? (
        <div className="card flex flex-col gap-4">
          {copied ? (
            <div className="rounded-card border border-brand/25 bg-brand-light/80 px-4 py-3 text-center">
              <p className="font-medium text-ink">Your review is copied!</p>
              <p className="mt-1 text-sm text-ink/70">
                Paste it into the Google review box and submit. That&apos;s all, thank you!
              </p>
            </div>
          ) : (
            <p className="text-sm font-medium text-ink/80">Here&apos;s your review:</p>
          )}
          <p className="rounded-card bg-brand-light p-4 text-sm text-ink">{draft}</p>
          {googleUrl ? (
            copied ? (
              <button
                type="button"
                onClick={() => {
                  trackAction("post");
                  window.open(googleUrl, "_blank");
                }}
                className="text-center text-sm font-medium text-brand underline decoration-brand/50 underline-offset-2 hover:decoration-brand"
              >
                Open Google again
              </button>
            ) : (
              <button onClick={handlePost} className="btn-primary">Post</button>
            )
          ) : (
            <p className="text-center text-xs text-ink/50">
              This business hasn't connected their Google listing yet. Feel free to copy
              your review above.
            </p>
          )}
        </div>
      ) : null}

      <p className="mt-8 text-center text-[11px] text-ink/40">
        Powered by{" "}
        <a
          href="https://www.amtechnexus.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-brand underline decoration-brand/50 underline-offset-2 hover:decoration-brand"
        >
          AM TechNexus Labs
        </a>
      </p>
    </main>
  );
}

function QuestionInput({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: string | number | undefined;
  onChange: (v: string | number) => void;
}) {
  if (question.type === "rating") {
    const rating = Number(value) || 0;
    return (
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            className="flex h-11 w-11 items-center justify-center rounded-lg active:bg-brand-light/60"
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill={n <= rating ? "#E8B23D" : "none"}
              stroke={n <= rating ? "#E8B23D" : "currentColor"}
              className="text-ink/30"
              strokeWidth="1.5"
            >
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z" />
            </svg>
          </button>
        ))}
      </div>
    );
  }

  if (question.type === "multiple_choice") {
    return (
      <div className="flex flex-col gap-2">
        {(question.options ?? []).map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`flex min-h-[48px] items-center gap-2 rounded-xl border px-3 py-3 text-left text-sm ${
              value === opt ? "border-brand bg-brand-light text-brand" : "border-ink/15 text-ink"
            }`}
          >
            <span
              className={`flex h-3.5 w-3.5 items-center justify-center rounded-full border ${
                value === opt ? "border-brand" : "border-ink/40"
              }`}
            >
              {value === opt && <span className="h-1.5 w-1.5 rounded-full bg-brand" />}
            </span>
            {opt}
          </button>
        ))}
      </div>
    );
  }

  if (question.type === "dropdown") {
    return (
      <select className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        <option value="" disabled>
          Choose one…
        </option>
        {(question.options ?? []).map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }

  return (
    <textarea
      className="input min-h-[80px]"
      value={(value as string) ?? ""}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function WhatsAppIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center px-4 py-8 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] text-center text-ink/70 sm:px-6">
      {children}
    </main>
  );
}
