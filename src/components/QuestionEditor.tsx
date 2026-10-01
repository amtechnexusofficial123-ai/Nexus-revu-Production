"use client";

import { QUESTION_TYPES, needsOptions, type QuestionType } from "@/lib/questionTypes";

export type EditableQuestion = {
  id?: string;
  text: string;
  type: QuestionType;
  options: string[] | null;
  active: boolean;
  alwaysAsk: boolean;
};

export const EMPTY_QUESTION: EditableQuestion = {
  text: "",
  type: "text",
  options: null,
  active: true,
  alwaysAsk: false,
};

export function QuestionEditorRow({
  q,
  index,
  expanded,
  onToggleExpand,
  onChange,
  onRemove,
  phone = false,
}: {
  q: EditableQuestion;
  index?: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onChange: (q: EditableQuestion) => void;
  onRemove: () => void;
  /** Tighter layout and larger tap targets for phone QR flow */
  phone?: boolean;
}) {
  const typeMeta = QUESTION_TYPES.find((t) => t.id === q.type);

  if (phone) {
    return (
      <li className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${q.active ? "border-ink/10" : "border-ink/10 opacity-70"}`}>
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex w-full items-start gap-3 px-4 py-4 text-left active:bg-ink/[0.03]"
        >
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-light text-xs font-semibold text-brand">
            {(index ?? 0) + 1}
          </span>
          <span className="min-w-0 flex-1">
            <span className={`block text-[15px] leading-snug ${q.active ? "text-ink" : "text-ink/40 line-through"}`}>
              {q.text || <span className="text-ink/40">Tap to write question…</span>}
            </span>
            <span className="mt-1 inline-flex flex-wrap items-center gap-1.5">
              <span className="rounded-full bg-brand-light px-2 py-0.5 text-[11px] font-medium text-brand">
                {typeMeta?.label}
                {!q.active ? " · Off" : ""}
              </span>
              {q.alwaysAsk && q.active && (
                <span className="rounded-full bg-ink/8 px-2 py-0.5 text-[11px] font-medium text-ink/70">
                  Always asked
                </span>
              )}
            </span>
          </span>
          <span className="mt-1 text-ink/35" aria-hidden>
            {expanded ? "▾" : "▸"}
          </span>
        </button>

        {expanded && (
          <div className="flex flex-col gap-4 border-t border-ink/10 px-4 pb-4 pt-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink/70">Question</label>
              <input
                className="input text-base"
                value={q.text}
                onChange={(e) => onChange({ ...q, text: e.target.value })}
                placeholder="e.g. How was your meal?"
                autoFocus={!q.text}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink/70">Answer type</label>
              <div className="grid grid-cols-2 gap-2">
                {QUESTION_TYPES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() =>
                      onChange({
                        ...q,
                        type: t.id,
                        options: needsOptions(t.id) ? q.options ?? ["Option 1", "Option 2"] : null,
                      })
                    }
                    className={`min-h-[48px] rounded-xl border px-3 py-2.5 text-left text-sm font-medium active:scale-[0.99] ${
                      q.type === t.id
                        ? "border-brand bg-brand-light text-brand"
                        : "border-ink/15 text-ink/75"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {needsOptions(q.type) && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink/70">Options</label>
                <div className="flex flex-col gap-2">
                  {(q.options ?? []).map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        className="input py-3 text-base"
                        value={opt}
                        onChange={(e) => {
                          const next = [...(q.options ?? [])];
                          next[i] = e.target.value;
                          onChange({ ...q, options: next });
                        }}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          onChange({ ...q, options: (q.options ?? []).filter((_, idx) => idx !== i) })
                        }
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-ink/10 text-red-500"
                        aria-label="Remove option"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      onChange({
                        ...q,
                        options: [...(q.options ?? []), `Option ${(q.options?.length ?? 0) + 1}`],
                      })
                    }
                    className="min-h-[44px] rounded-xl border border-dashed border-brand/40 px-3 text-sm font-medium text-brand"
                  >
                    + Add option
                  </button>
                </div>
              </div>
            )}

            {q.type === "rating" && (
              <p className="text-xs text-ink/50">Customers tap 1–5 stars. Nothing else to set up.</p>
            )}

            <label className="flex min-h-[48px] items-start gap-3 rounded-xl border border-ink/10 bg-ink/[0.02] px-3 py-3">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 shrink-0"
                checked={q.alwaysAsk}
                disabled={!q.active}
                onChange={(e) =>
                  onChange({
                    ...q,
                    alwaysAsk: e.target.checked,
                    active: e.target.checked ? true : q.active,
                  })
                }
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">Always ask this question</span>
                <span className="mt-0.5 block text-xs leading-snug text-ink/55">
                  Customers always see this one. Only one question can be always asked.
                </span>
              </span>
            </label>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...q,
                    active: !q.active,
                    alwaysAsk: !q.active ? q.alwaysAsk : false,
                  })
                }
                className="btn-secondary min-h-[48px] text-sm"
              >
                {q.active ? "Turn off" : "Turn on"}
              </button>
              <button
                type="button"
                onClick={onRemove}
                className="min-h-[48px] rounded-card border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </li>
    );
  }

  return (
    <li className="card">
      <div className="flex items-center justify-between gap-4">
        <button type="button" onClick={onToggleExpand} className="flex flex-1 items-center gap-3 text-left">
          <span className={`text-sm ${q.active ? "text-ink" : "text-ink/40 line-through"}`}>
            {q.text || <span className="text-ink/40">Untitled question</span>}
          </span>
        </button>
        <span className="shrink-0 rounded-full bg-brand-light px-2.5 py-1 text-[11px] font-medium text-brand">
          {typeMeta?.label}
        </span>
        {q.alwaysAsk && q.active && (
          <span className="shrink-0 rounded-full bg-ink/8 px-2.5 py-1 text-[11px] font-medium text-ink/70">
            Always asked
          </span>
        )}
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() =>
              onChange({
                ...q,
                active: !q.active,
                alwaysAsk: !q.active ? q.alwaysAsk : false,
              })
            }
            className="btn-secondary py-1.5 text-xs"
          >
            {q.active ? "Disable" : "Enable"}
          </button>
          <button type="button" onClick={onRemove} className="btn-secondary py-1.5 text-xs text-red-600">
            Delete
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 flex flex-col gap-4 border-t border-ink/10 pt-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink/70">Question text</label>
            <input
              className="input"
              value={q.text}
              onChange={(e) => onChange({ ...q, text: e.target.value })}
              placeholder="e.g. What did you order today?"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink/70">Answer type</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {QUESTION_TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() =>
                    onChange({
                      ...q,
                      type: t.id,
                      options: needsOptions(t.id) ? q.options ?? ["Option 1", "Option 2"] : null,
                    })
                  }
                  className={`rounded-xl border px-2.5 py-2 text-xs font-medium ${
                    q.type === t.id ? "border-brand bg-brand-light text-brand" : "border-ink/15 text-ink/70"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {needsOptions(q.type) && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink/70">
                Options customers can pick from
              </label>
              <div className="flex flex-col gap-2">
                {(q.options ?? []).map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      className="input py-1.5"
                      value={opt}
                      onChange={(e) => {
                        const next = [...(q.options ?? [])];
                        next[i] = e.target.value;
                        onChange({ ...q, options: next });
                      }}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        onChange({ ...q, options: (q.options ?? []).filter((_, idx) => idx !== i) })
                      }
                      className="text-xs text-red-500"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...q,
                      options: [...(q.options ?? []), `Option ${(q.options?.length ?? 0) + 1}`],
                    })
                  }
                  className="w-fit text-xs font-medium text-brand"
                >
                  + Add option
                </button>
              </div>
            </div>
          )}

          {q.type === "rating" && (
            <p className="text-xs text-ink/50">Customers answer with a 1–5 star tap. No extra setup needed.</p>
          )}

          <label className="flex items-start gap-3 rounded-xl border border-ink/10 bg-ink/[0.02] px-3 py-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 shrink-0"
              checked={q.alwaysAsk}
              disabled={!q.active}
              onChange={(e) =>
                onChange({
                  ...q,
                  alwaysAsk: e.target.checked,
                  active: e.target.checked ? true : q.active,
                })
              }
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ink">Always ask this question</span>
              <span className="mt-0.5 block text-xs leading-snug text-ink/55">
                Customers always see this one. Only one question can be always asked.
              </span>
            </span>
          </label>
        </div>
      )}
    </li>
  );
}
