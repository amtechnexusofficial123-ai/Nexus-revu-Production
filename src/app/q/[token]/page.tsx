"use client";

import { useEffect, useState, use } from "react";
import {
  QuestionEditorRow,
  EMPTY_QUESTION,
  type EditableQuestion,
} from "@/components/QuestionEditor";
import { needsOptions } from "@/lib/questionTypes";
import { MAX_QUESTIONS } from "@/lib/questions";

export default function ManageQuestionsPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [businessName, setBusinessName] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [questions, setQuestions] = useState<EditableQuestion[]>([]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [step, setStep] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/manage/${encodeURIComponent(token)}/questions`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Not found");
        setBusinessName(data.business.name);
        setLogoUrl(data.business.logoUrl);
        setQuestions(data.questions ?? []);
        if ((data.questions ?? []).length === 0) {
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
    setQuestions((qs) => qs.map((q, i) => (i === index ? updated : q)));
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
    setQuestions(data.questions.length ? data.questions : [{ ...EMPTY_QUESTION }]);
    if (data.questions.length === 0) setExpandedIndex(0);
    setMessage(cleaned.length === 0 ? "Cleared. Add a question when you’re ready." : "Saved.");
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
              {count} / {MAX_QUESTIONS} questions · edit & save
            </p>
          </div>
        </div>
      </header>

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
    </main>
  );
}
