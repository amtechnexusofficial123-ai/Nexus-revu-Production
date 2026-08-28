import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { businesses, questions } from "@/db/schema";
import { getSessionAdminId } from "@/lib/auth";
import {
  normalizeQuestionsForInsert,
  validateQuestionSet,
  type IncomingQuestion,
} from "@/lib/questions";
import { eq, and } from "drizzle-orm";

async function assertOwnership(businessId: string, adminId: string) {
  const [business] = await db
    .select()
    .from(businesses)
    .where(and(eq(businesses.id, businessId), eq(businesses.adminId, adminId)));
  return business ?? null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getSessionAdminId();
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const business = await assertOwnership(id, adminId);
  if (!business) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await db
    .select()
    .from(questions)
    .where(eq(questions.businessId, id))
    .orderBy(questions.position);

  return NextResponse.json({ questions: rows });
}

/**
 * Overwrites the business's entire question set with whatever is sent.
 * Full replace so the dashboard/editor can save local state as-is.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getSessionAdminId();
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const business = await assertOwnership(id, adminId);
  if (!business) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { questions: incoming }: { questions: IncomingQuestion[] } = await req.json();
  const error = validateQuestionSet(incoming ?? []);
  if (error) return NextResponse.json({ error }, { status: 400 });

  await db.delete(questions).where(eq(questions.businessId, id));

  if (incoming.length > 0) {
    await db.insert(questions).values(normalizeQuestionsForInsert(id, incoming));
  }

  const saved = await db
    .select()
    .from(questions)
    .where(eq(questions.businessId, id))
    .orderBy(questions.position);

  return NextResponse.json({ questions: saved });
}
