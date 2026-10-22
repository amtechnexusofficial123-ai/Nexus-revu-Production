import { NextRequest, NextResponse } from "next/server";
import { pickQuestionCount, pickRandomQuestions } from "@/lib/reviewDraft";
import { isCustomerQrActive } from "@/lib/billing";
import { errorDetail, formatErrorDetail, logAppError } from "@/lib/errorLog";
import { loadBusinessQuestionPool } from "@/lib/reviewQuestions";

export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}


export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  try {
    if (!slug) return json({ error: "slug required" }, 400);

    const result = await loadBusinessQuestionPool(slug);
    if (!result) return json({ error: "Business not found" }, 404);
    const { business, pool } = result;
    if (!isCustomerQrActive(business)) {
      return json({ error: "This review link is currently unavailable." }, 403);
    }
    if (pool.length === 0) {
      return json({ error: "This business hasn't set up any questions yet" }, 404);
    }

    const picked = pickRandomQuestions(pool, pickQuestionCount(pool.length));

    // Never embed data-URL logos in JSON — large base64 payloads were getting
    // truncated around 16KB on flaky mobile networks ("Unterminated string at 16384").
    const logoUrl = business.logoUrl
      ? business.logoUrl.startsWith("data:")
        ? `/api/review/logo?slug=${encodeURIComponent(business.slug)}`
        : business.logoUrl
      : null;

    return json({
      business: { name: business.name, logoUrl, slug: business.slug },
      questions: picked.map((q) => ({ id: q.id, text: q.text, type: q.type, options: q.options })),
    });
  } catch (err) {
    console.error("GET /api/review/questions failed", err);
    void logAppError({
      source: "review_questions_api",
      message: "Could not load this review page. Please try again.",
      slug,
      detail: formatErrorDetail({
        stage: "questions_route_exception",
        error: errorDetail(err),
      }),
    });
    return json({ error: "Could not load this review page. Please try again." }, 503);
  }
}
