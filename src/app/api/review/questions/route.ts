import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { businesses, questions } from "@/db/schema";
import { pickQuestionCount, pickRandomQuestions } from "@/lib/reviewDraft";
import { eq, and } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

  const [business] = await db.select().from(businesses).where(eq(businesses.slug, slug));
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const pool = await db
    .select()
    .from(questions)
    .where(and(eq(questions.businessId, business.id), eq(questions.active, true)));

  if (pool.length === 0) {
    return NextResponse.json({ error: "This business hasn't set up any questions yet" }, { status: 404 });
  }

  const picked = pickRandomQuestions(pool, pickQuestionCount(pool.length));

  return NextResponse.json({
    business: { name: business.name, logoUrl: business.logoUrl, slug: business.slug },
    questions: picked.map((q) => ({ id: q.id, text: q.text, type: q.type, options: q.options })),
  });
}
