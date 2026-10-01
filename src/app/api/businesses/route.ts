import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { businesses, questions } from "@/db/schema";
import { getSessionAdminId } from "@/lib/auth";
import { normalizeLogoUrl } from "@/lib/logoValidation";
import { normalizeBusinessDetails, validateBusinessDetails } from "@/lib/businessValidation";
import { normalizeBillingMode, normalizeRazorpayYearlyAmount } from "@/lib/billing";
import {
  normalizeQuestionsForInsert,
  type IncomingQuestion,
} from "@/lib/questions";
import type { QuestionType } from "@/lib/questionTypes";
import { scheduleBacklogRefill } from "@/lib/reviewBacklog";
import { nanoid } from "nanoid";
import { and, eq, desc } from "drizzle-orm";

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "business"
  );
}

export async function GET() {
  const adminId = await getSessionAdminId();
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select()
    .from(businesses)
    .where(eq(businesses.adminId, adminId))
    .orderBy(desc(businesses.createdAt));

  return NextResponse.json({ businesses: rows });
}

export async function POST(req: NextRequest) {
  const adminId = await getSessionAdminId();
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    name,
    address,
    category,
    description,
    reviewThemes,
    logoUrl,
    googlePlaceId,
    whatsappNumber,
    billingMode,
    razorpayYearlyAmount,
    copyFromBusinessId,
  } = body;

  let source: typeof businesses.$inferSelect | null = null;
  if (copyFromBusinessId) {
    const [row] = await db
      .select()
      .from(businesses)
      .where(
        and(eq(businesses.id, String(copyFromBusinessId)), eq(businesses.adminId, adminId))
      );
    if (!row) {
      return NextResponse.json({ error: "Source business not found" }, { status: 404 });
    }
    source = row;
  }

  const validationError = validateBusinessDetails({
    name,
    address,
    category,
    description,
    reviewThemes,
    googlePlaceId,
    whatsappNumber,
  });
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const details = normalizeBusinessDetails({
    name,
    address,
    category,
    description,
    reviewThemes,
    googlePlaceId,
    whatsappNumber,
  });

  const logo = normalizeLogoUrl(logoUrl ?? null);
  if (logo && typeof logo === "object" && "error" in logo) {
    return NextResponse.json({ error: logo.error }, { status: 400 });
  }

  const slug = `${slugify(name)}-${nanoid(5)}`;
  const manageToken = nanoid(24);
  const mode = normalizeBillingMode(billingMode);
  const yearlyAmount =
    mode === "razorpay" ? normalizeRazorpayYearlyAmount(razorpayYearlyAmount) : 2500;

  const [business] = await db
    .insert(businesses)
    .values({
      adminId,
      name: details.name,
      address: details.address,
      category: details.category,
      description: details.description,
      reviewThemes: details.reviewThemes,
      logoUrl: logo,
      googlePlaceId: details.googlePlaceId,
      whatsappNumber: details.whatsappNumber,
      billingMode: mode,
      razorpayYearlyAmount: yearlyAmount,
      slug,
      manageToken,
    })
    .returning();

  let copiedQuestions = 0;
  if (source) {
    const sourceQuestions = await db
      .select()
      .from(questions)
      .where(eq(questions.businessId, source.id))
      .orderBy(questions.position);

    if (sourceQuestions.length > 0) {
      const incoming: IncomingQuestion[] = sourceQuestions.map((q) => ({
        text: q.text,
        type: q.type as QuestionType,
        options: q.options,
        active: q.active,
        alwaysAsk: q.alwaysAsk,
      }));
      await db.insert(questions).values(normalizeQuestionsForInsert(business.id, incoming));
      copiedQuestions = incoming.length;
    }
  }

  scheduleBacklogRefill(business.id);

  return NextResponse.json({ business, copiedQuestions });
}
