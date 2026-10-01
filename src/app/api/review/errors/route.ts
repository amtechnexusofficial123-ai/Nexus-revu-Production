import { NextRequest, NextResponse } from "next/server";
import { formatErrorDetail, logAppError } from "@/lib/errorLog";

export const dynamic = "force-dynamic";

/**
 * Public endpoint so the customer review page can report load/draft failures.
 * Best-effort only — always returns 204 so it never blocks the customer UI.
 * Detail is for the admin Errors dashboard only.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      source?: string;
      message?: string;
      slug?: string;
      detail?: string | Record<string, unknown>;
    };

    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) {
      return new NextResponse(null, { status: 204 });
    }

    let detail: string | null = null;
    if (typeof body.detail === "string") {
      detail = body.detail;
    } else if (body.detail && typeof body.detail === "object") {
      detail = formatErrorDetail(
        Object.fromEntries(
          Object.entries(body.detail).map(([k, v]) => [
            k,
            v === null || v === undefined ? null : typeof v === "object" ? JSON.stringify(v) : String(v),
          ])
        )
      );
    }

    const ua = req.headers.get("user-agent");
    const cfRay = req.headers.get("cf-ray");
    const enriched = formatErrorDetail({
      ...(detail ? { clientDetail: detail } : {}),
      userAgent: ua,
      cfRay,
    });

    await logAppError({
      source:
        typeof body.source === "string" && body.source.trim()
          ? body.source.trim()
          : "review_client",
      message,
      slug: typeof body.slug === "string" ? body.slug : null,
      detail: enriched || null,
    });
  } catch (err) {
    console.error("POST /api/review/errors failed", err);
  }

  return new NextResponse(null, { status: 204 });
}
