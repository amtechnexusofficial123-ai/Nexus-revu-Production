import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { businesses, questions } from "@/db/schema";
import { pickQuestionCount, pickRandomQuestions } from "@/lib/reviewDraft";
import { isCustomerQrActive } from "@/lib/billing";
import { errorDetail, formatErrorDetail, logAppError } from "@/lib/errorLog";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

type BusinessRow = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  enabled: boolean;
  billingMode: string;
  razorpaySubscriptionStatus: string | null;
  paidUntil: Date | null;
};

type QuestionPoolRow = {
  id: string;
  text: string;
  type: string;
  options: string[] | null;
  alwaysAsk: boolean;
};

const QUESTIONS_CACHE_TTL_MS = 15_000;
const questionsCache = new Map<
  string,
  { expiresAt: number; business: BusinessRow; pool: QuestionPoolRow[] }
>();

async function loadBusinessQuestionPool(slug: string) {
  const cached = questionsCache.get(slug);
  if (cached && cached.expiresAt > Date.now()) return cached;

  const rows = await db
    .select({
      business: {
        id: businesses.id,
        name: businesses.name,
        slug: businesses.slug,
        logoUrl: businesses.logoUrl,
        enabled: businesses.enabled,
        billingMode: businesses.billingMode,
        razorpaySubscriptionStatus: businesses.razorpaySubscriptionStatus,
        paidUntil: businesses.paidUntil,
      },
      question: {
        id: questions.id,
        text: questions.text,
        type: questions.type,
        options: questions.options,
        alwaysAsk: questions.alwaysAsk,
      },
    })
    .from(businesses)
    .leftJoin(
      questions,
      and(eq(questions.businessId, businesses.id), eq(questions.active, true))
    )
    .where(eq(businesses.slug, slug));

  const business = rows[0]?.business;
  if (!business) return null;

  const pool = rows
    .map((row) => row.question)
    .filter((question): question is QuestionPoolRow => question?.id != null);
  const entry = { expiresAt: Date.now() + QUESTIONS_CACHE_TTL_MS, business, pool };
  questionsCache.set(slug, entry);
  return entry;
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
