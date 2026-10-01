import { db } from "@/db";
import { appErrors, businesses } from "@/db/schema";
import { eq } from "drizzle-orm";

type LogAppErrorInput = {
  source: string;
  /** Short summary shown as the main Error column (ok if same as customer-facing text). */
  message: string;
  slug?: string | null;
  businessId?: string | null;
  /** Admin-only diagnostics — never shown to customers. */
  detail?: string | null;
};

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** Best-effort insert — never throws to callers. */
export async function logAppError(input: LogAppErrorInput): Promise<void> {
  try {
    const message = truncate(input.message.trim() || "Unknown error", 1000);
    const detail = input.detail ? truncate(input.detail.trim(), 4000) : null;
    let businessId = input.businessId ?? null;
    const slug = input.slug?.trim() || null;

    if (!businessId && slug) {
      const [row] = await db
        .select({ id: businesses.id })
        .from(businesses)
        .where(eq(businesses.slug, slug))
        .limit(1);
      businessId = row?.id ?? null;
    }

    await db.insert(appErrors).values({
      businessId,
      slug,
      source: truncate(input.source, 120),
      message,
      detail,
    });
  } catch (err) {
    console.error("logAppError failed", err);
  }
}

export function errorDetail(err: unknown): string {
  if (err instanceof Error) {
    const stack = err.stack ? `\n${err.stack.split("\n").slice(0, 6).join("\n")}` : "";
    return truncate(`${err.name}: ${err.message}${stack}`, 4000);
  }
  return truncate(String(err), 4000);
}

/** Build a multi-line admin diagnostic blob from structured fields. */
export function formatErrorDetail(
  fields: Record<string, string | number | boolean | null | undefined>
): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === "") continue;
    lines.push(`${key}: ${String(value)}`);
  }
  return truncate(lines.join("\n"), 4000);
}
