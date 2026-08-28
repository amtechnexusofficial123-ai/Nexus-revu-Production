import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { businesses } from "@/db/schema";
import { getSessionAdminId } from "@/lib/auth";
import { normalizeLogoUrl } from "@/lib/logoValidation";
import { normalizeBusinessDetails, validateBusinessDetails } from "@/lib/businessValidation";
import { eq, and } from "drizzle-orm";

async function loadOwned(id: string, adminId: string) {
  const [business] = await db
    .select()
    .from(businesses)
    .where(and(eq(businesses.id, id), eq(businesses.adminId, adminId)));
  return business ?? null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getSessionAdminId();
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const business = await loadOwned(id, adminId);
  if (!business) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ business });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getSessionAdminId();
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await loadOwned(id, adminId);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { name, address, category, description, reviewThemes, logoUrl, googlePlaceId } = await req.json();

  const validationError = validateBusinessDetails({
    name,
    address,
    category,
    description,
    reviewThemes,
    googlePlaceId,
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
  });

  let normalizedLogo: string | null | undefined = undefined;
  if (logoUrl !== undefined) {
    const logo = normalizeLogoUrl(logoUrl);
    if (logo && typeof logo === "object" && "error" in logo) {
      return NextResponse.json({ error: logo.error }, { status: 400 });
    }
    normalizedLogo = logo;
  }

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
    })
    .where(eq(businesses.id, id))
    .returning();

  return NextResponse.json({ business: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getSessionAdminId();
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await loadOwned(id, adminId);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.delete(businesses).where(eq(businesses.id, id));
  return NextResponse.json({ ok: true });
}
