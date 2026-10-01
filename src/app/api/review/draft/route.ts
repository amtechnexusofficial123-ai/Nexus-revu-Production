import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { businesses, reviewSessions } from "@/db/schema";
import { draftReviewWithGemini, isGeminiConfigured } from "@/lib/gemini";
import { draftReview, estimateSentiment } from "@/lib/reviewDraft";
import {
  scheduleBacklogRefill,
  takeBacklogDraft,
} from "@/lib/reviewBacklog";
import { googleWriteReviewUrl } from "@/lib/qr";
import {
  buildNegativeReviewWhatsAppMessage,
  whatsappChatUrl,
} from "@/lib/whatsapp";
import { formatAnswerForDisplay, type QuestionType } from "@/lib/questionTypes";
import { isCustomerQrActive } from "@/lib/billing";
import { errorDetail, formatErrorDetail, logAppError } from "@/lib/errorLog";
import { checkDraftVelocity } from "@/lib/reviewVelocity";
import { desc, eq } from "drizzle-orm";

type Body = {
  slug: string;
  answers: { questionId: string; question: string; type: QuestionType; answer: string | number }[];
};

/** Cap live Gemini so we fall back to backlog/template before Cloudflare kills the request. */
const LIVE_GEMINI_BUDGET_MS = 12000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

async function buildDraft(
  business: {
    id: string;
    name: string;
    category: string | null;
    description: string | null;
    reviewThemes: string[] | null;
    slug: string;
  },
  formatted: { question: string; answer: string }[],
  recentDrafts: string[],
  sessionId: string
): Promise<{ draftText: string; sentiment: string; source: "gemini" | "backlog" | "template" }> {
  if (isGeminiConfigured()) {
    try {
      const result = await withTimeout(
        draftReviewWithGemini(
          {
            name: business.name,
            category: business.category,
            description: business.description,
            reviewThemes: business.reviewThemes,
          },
          formatted,
          recentDrafts,
          { antiRepeatRetry: false, businessId: business.id, sessionId }
        ),
        LIVE_GEMINI_BUDGET_MS,
        "Gemini live draft budget exceeded"
      );
      return { ...result, source: "gemini" };
    } catch (err) {
      console.error("Gemini draft failed, trying backlog:", err);
      // Admin-only: customer still gets a draft via backlog/template.
      void logAppError({
        source: "review_draft_gemini_fallback",
        message: "Gemini failed; served backlog/template instead",
        slug: business.slug,
        businessId: business.id,
        detail: formatErrorDetail({
          stage: "gemini_failed_falling_back",
          geminiBudgetMs: LIVE_GEMINI_BUDGET_MS,
          answerCount: formatted.length,
          error: errorDetail(err),
        }),
      });
    }
  }

  const preferred = estimateSentiment(formatted);
  const backlog = await takeBacklogDraft(business.id, preferred);
  if (backlog) {
    scheduleBacklogRefill(business.id);
    return { ...backlog, source: "backlog" };
  }

  const template = draftReview(business.name, formatted, {
    category: business.category,
    description: business.description,
    reviewThemes: business.reviewThemes,
  });
  scheduleBacklogRefill(business.id);
  return { ...template, source: "template" };
}

export async function POST(req: NextRequest) {
  let slugForLog: string | null = null;
  try {
    const { slug, answers }: Body = await req.json();
    slugForLog = slug ?? null;

    if (!slug || !Array.isArray(answers)) {
      return NextResponse.json({ error: "slug and answers are required" }, { status: 400 });
    }

    const [business] = await db.select().from(businesses).where(eq(businesses.slug, slug));
    if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });
    if (!isCustomerQrActive(business)) {
      return NextResponse.json(
        { error: "This review link is currently unavailable." },
        { status: 403 }
      );
    }

    const velocity = await checkDraftVelocity(business.id);
    if (velocity.exceeded) {
      return NextResponse.json(
        { error: velocity.message ?? "Please try again later." },
        { status: 429 }
      );
    }

    // Do NOT start backlog refill here — concurrent Gemini calls during the
    // customer draft are a common cause of Cloudflare HTTP 503s.

    const formatted = answers
      .map((a) => ({
        question: a.question,
        answer: formatAnswerForDisplay(a.type ?? "text", a.answer),
      }))
      .filter((qa) => qa.answer.trim());

    const recentRows = await db
      .select({ draftText: reviewSessions.draftText })
      .from(reviewSessions)
      .where(eq(reviewSessions.businessId, business.id))
      .orderBy(desc(reviewSessions.createdAt))
      .limit(5);

    const recentDrafts = recentRows
      .map((r) => r.draftText)
      .filter((t): t is string => Boolean(t?.trim()));

    // Generated up front so Gemini usage rows can reference the session before it is inserted.
    const sessionId = crypto.randomUUID();

    let { draftText, sentiment, source } = await buildDraft(
      business,
      formatted,
      recentDrafts,
      sessionId
    );

    if (!draftText?.trim()) {
      const fallback = draftReview(business.name, formatted, {
        category: business.category,
        description: business.description,
        reviewThemes: business.reviewThemes,
      });
      draftText = fallback.draftText;
      sentiment = fallback.sentiment;
      source = "template";
    }

    const sessionAnswers = Object.fromEntries(
      answers
        .map((a) => {
          const display = formatAnswerForDisplay(a.type ?? "text", a.answer);
          return display.trim() ? [a.questionId, display] : null;
        })
        .filter((e): e is [string, string] => e !== null)
    );

    const [session] = await db
      .insert(reviewSessions)
      .values({
        id: sessionId,
        businessId: business.id,
        questionIds: answers.map((a) => a.questionId),
        answers: sessionAnswers,
        draftText,
        sentiment,
      })
      .returning({ id: reviewSessions.id });

    const googleUrl = business.googlePlaceId
      ? googleWriteReviewUrl(business.googlePlaceId)
      : null;

    const whatsappUrl =
      sentiment === "negative" && business.whatsappNumber
        ? whatsappChatUrl(
            business.whatsappNumber,
            buildNegativeReviewWhatsAppMessage(business.name, formatted)
          )
        : null;

    // Refill after the customer response is ready (fire-and-forget).
    if (source === "gemini") {
      scheduleBacklogRefill(business.id);
    }

    return NextResponse.json({
      sessionId: session.id,
      draftText,
      sentiment,
      googleUrl,
      whatsappUrl,
      draftSource: source,
    });
  } catch (err) {
    console.error("Review draft route error:", err);
    void logAppError({
      source: "review_draft_api",
      message: "Could not generate your review. Please try again.",
      slug: slugForLog,
      detail: formatErrorDetail({
        stage: "draft_route_exception",
        error: errorDetail(err),
      }),
    });
    return NextResponse.json(
      { error: "Could not generate your review. Please try again." },
      { status: 500 }
    );
  }
}
