import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { businesses, reviewSessions } from "@/db/schema";
import { draftReviewWithGemini, isGeminiConfigured } from "@/lib/gemini";
import { draftReview } from "@/lib/reviewDraft";
import { googleWriteReviewUrl } from "@/lib/qr";
import { formatAnswerForDisplay, type QuestionType } from "@/lib/questionTypes";
import { desc, eq } from "drizzle-orm";

type Body = {
  slug: string;
  answers: { questionId: string; question: string; type: QuestionType; answer: string | number }[];
};

async function buildDraft(
  business: {
    name: string;
    category: string | null;
    description: string | null;
    reviewThemes: string[] | null;
  },
  formatted: { question: string; answer: string }[],
  recentDrafts: string[]
): Promise<{ draftText: string; sentiment: string }> {
  if (isGeminiConfigured()) {
    try {
      return await draftReviewWithGemini(
        {
          name: business.name,
          category: business.category,
          description: business.description,
          reviewThemes: business.reviewThemes,
        },
        formatted,
        recentDrafts
      );
    } catch (err) {
      console.error("Gemini draft failed, using template fallback:", err);
    }
  }

  return draftReview(business.name, formatted, {
    category: business.category,
    description: business.description,
    reviewThemes: business.reviewThemes,
  });
}

export async function POST(req: NextRequest) {
  try {
    const { slug, answers }: Body = await req.json();

    if (!slug || !Array.isArray(answers)) {
      return NextResponse.json({ error: "slug and answers are required" }, { status: 400 });
    }

    const [business] = await db.select().from(businesses).where(eq(businesses.slug, slug));
    if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

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

    let { draftText, sentiment } = await buildDraft(business, formatted, recentDrafts);

    if (!draftText?.trim()) {
      const fallback = draftReview(business.name, formatted, {
        category: business.category,
        description: business.description,
        reviewThemes: business.reviewThemes,
      });
      draftText = fallback.draftText;
      sentiment = fallback.sentiment;
    }

    const sessionAnswers = Object.fromEntries(
      answers
        .map((a) => {
          const display = formatAnswerForDisplay(a.type ?? "text", a.answer);
          return display.trim() ? [a.questionId, display] : null;
        })
        .filter((e): e is [string, string] => e !== null)
    );

    await db.insert(reviewSessions).values({
      businessId: business.id,
      questionIds: answers.map((a) => a.questionId),
      answers: sessionAnswers,
      draftText,
      sentiment,
    });

    const googleUrl = business.googlePlaceId
      ? googleWriteReviewUrl(business.googlePlaceId)
      : null;

    return NextResponse.json({ draftText, sentiment, googleUrl });
  } catch (err) {
    console.error("Review draft route error:", err);
    return NextResponse.json(
      { error: "Could not generate your review. Please try again." },
      { status: 500 }
    );
  }
}
