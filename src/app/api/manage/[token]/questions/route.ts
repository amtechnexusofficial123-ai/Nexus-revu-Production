import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { businesses, questions } from "@/db/schema";
import {
  normalizeQuestionsForInsert,
  validateQuestionSet,
  type IncomingQuestion,
} from "@/lib/questions";
import { eq } from "drizzle-orm";

async function loadByToken(token: string) {
  const [business] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.manageToken, token));
  return business ?? null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const business = await loadByToken(token);
  if (!business) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await db
    .select()
    .from(questions)
    .where(eq(questions.businessId, business.id))
    .orderBy(questions.position);

  return NextResponse.json({
    business: { name: business.name, logoUrl: business.logoUrl },
    questions: rows,
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const business = await loadByToken(token);
  if (!business) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { questions: incoming }: { questions: IncomingQuestion[] } = await req.json();
  const error = validateQuestionSet(incoming ?? []);
  if (error) return NextResponse.json({ error }, { status: 400 });

  await db.delete(questions).where(eq(questions.businessId, business.id));

  if (incoming.length > 0) {
    await db.insert(questions).values(normalizeQuestionsForInsert(business.id, incoming));
  }

  const saved = await db
    .select()
    .from(questions)
    .where(eq(questions.businessId, business.id))
    .orderBy(questions.position);

  return NextResponse.json({ questions: saved });
}
