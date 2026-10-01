import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { businesses } from "@/db/schema";
import { getSessionAdminId } from "@/lib/auth";
import { normalizeLogoUrl } from "@/lib/logoValidation";
import { normalizeBusinessDetails, validateBusinessDetails } from "@/lib/businessValidation";
import { normalizeBillingMode, normalizeRazorpayYearlyAmount } from "@/lib/billing";
import { nanoid } from "nanoid";
import { eq, and } from "drizzle-orm";

async function loadOwned(id: string, adminId: string) {
  const [business] = await db
    .select()
    .from(businesses)
    .where(and(eq(businesses.id, id), eq(businesses.adminId, adminId)));
  return business ?? null;
}

async function ensureManageToken(business: typeof businesses.$inferSelect) {
  if (business.manageToken) return business;
  const manageToken = nanoid(24);
  const [updated] = await db
    .update(businesses)
    .set({ manageToken })
    .where(eq(businesses.id, business.id))
    .returning();
  return updated ?? business;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getSessionAdminId();
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const row = await loadOwned(id, adminId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const business = await ensureManageToken(row);
  return NextResponse.json({ business });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getSessionAdminId();
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await loadOwned(id, adminId);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();

  // Quick admin toggles (enabled / billingMode / amount) without full details form.
  const onlyBillingToggle =
    body.name === undefined &&
    body.address === undefined &&
    body.category === undefined &&
    body.description === undefined &&
    body.reviewThemes === undefined &&
    body.logoUrl === undefined &&
    body.googlePlaceId === undefined &&
    body.whatsappNumber === undefined;

  if (onlyBillingToggle) {
    const patch: Partial<typeof businesses.$inferInsert> = {};
    if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
    if (body.billingMode !== undefined) patch.billingMode = normalizeBillingMode(body.billingMode);
    if (body.razorpayYearlyAmount !== undefined) {
      patch.razorpayYearlyAmount = normalizeRazorpayYearlyAmount(body.razorpayYearlyAmount);
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }
    const [updated] = await db
      .update(businesses)
      .set(patch)
      .where(eq(businesses.id, id))
      .returning();
    return NextResponse.json({ business: updated });
  }

  const {
    name,
    address,
    category,
    description,
    reviewThemes,
    logoUrl,
    googlePlaceId,
    whatsappNumber,
    enabled,
    billingMode,
    razorpayYearlyAmount,
  } = body;

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

  let normalizedLogo: string | null | undefined = undefined;
  if (logoUrl !== undefined) {
    const logo = normalizeLogoUrl(logoUrl);
    if (logo && typeof logo === "object" && "error" in logo) {
      return NextResponse.json({ error: logo.error }, { status: 400 });
    }
    normalizedLogo = logo;
  }

  const mode =
    billingMode !== undefined ? normalizeBillingMode(billingMode) : normalizeBillingMode(existing.billingMode);
  const yearlyAmount =
    razorpayYearlyAmount !== undefined
      ? normalizeRazorpayYearlyAmount(razorpayYearlyAmount)
      : normalizeRazorpayYearlyAmount(existing.razorpayYearlyAmount);

  const [updated] = await db
    .update(businesses)
    .set({
      name: details.name,
      address: details.address,
      category: details.category,
      description: details.description,
      reviewThemes: details.reviewThemes,
      ...(normalizedLogo !== undefined && { logoUrl: normalizedLogo }),
      googlePlaceId: details.googlePlaceId,
      whatsappNumber: details.whatsappNumber,
      ...(typeof enabled === "boolean" && { enabled }),
      ...(billingMode !== undefined && { billingMode: mode }),
      ...(billingMode !== undefined || razorpayYearlyAmount !== undefined
        ? { razorpayYearlyAmount: yearlyAmount }
        : {}),
    })
    .where(eq(businesses.id, id))
    .returning();

  return NextResponse.json({ business: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getSessionAdminId();
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await loadOwned(id, adminId);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.delete(businesses).where(eq(businesses.id, id));
  return NextResponse.json({ ok: true });
}
