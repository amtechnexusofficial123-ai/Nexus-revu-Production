import { db } from "@/db";
import { questions } from "@/db/schema";
import {
  normalizeQuestionsForInsert,
  type IncomingQuestion,
} from "@/lib/questions";
import { eq, inArray } from "drizzle-orm";

/**
 * Replace a business's question set without a empty gap.
 * Inserts the new rows first, then deletes the previous ones — so a
 * customer scan mid-save still sees questions.
 */
export async function replaceBusinessQuestions(
  businessId: string,
  incoming: IncomingQuestion[]
) {
  const existing = await db
    .select({ id: questions.id })
    .from(questions)
    .where(eq(questions.businessId, businessId));
  const oldIds = existing.map((row) => row.id);

  if (incoming.length > 0) {
    await db.insert(questions).values(normalizeQuestionsForInsert(businessId, incoming));
  }

  if (oldIds.length > 0) {
    await db.delete(questions).where(inArray(questions.id, oldIds));
  }

  return db
    .select()
    .from(questions)
    .where(eq(questions.businessId, businessId))
    .orderBy(questions.position);
}
