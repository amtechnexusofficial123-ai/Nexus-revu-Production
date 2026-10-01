import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { businesses } from "@/db/schema";
import { normalizeLogoUrl } from "@/lib/logoValidation";
import {
  parseReviewThemes,
  validateReviewThemes,
} from "@/lib/reviewThemes";
import {
  normalizeWhatsAppNumber,
  validateWhatsAppNumber,
} from "@/lib/whatsapp";
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

  return NextResponse.json({
    business: {
      name: business.name,
      logoUrl: business.logoUrl,
      description: business.description,
      reviewThemes: business.reviewThemes,
      whatsappNumber: business.whatsappNumber,
    },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const business = await loadByToken(token);
  if (!business) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const description =
    typeof body.description === "string" ? body.description.trim() : "";
  if (!description) {
    return NextResponse.json({ error: "Business description is required" }, { status: 400 });
  }

  const themes = parseReviewThemes(body.reviewThemes);
  const themesError = validateReviewThemes(themes);
  if (themesError) {
    return NextResponse.json({ error: themesError }, { status: 400 });
  }

  const logo = normalizeLogoUrl(body.logoUrl ?? null);
  if (logo && typeof logo === "object" && "error" in logo) {
    return NextResponse.json({ error: logo.error }, { status: 400 });
  }

  const whatsappError = validateWhatsAppNumber(body.whatsappNumber);
  if (whatsappError) {
    return NextResponse.json({ error: whatsappError }, { status: 400 });
  }
  const whatsappNumber = normalizeWhatsAppNumber(body.whatsappNumber);

  const [updated] = await db
    .update(businesses)
    .set({
      description,
      reviewThemes: themes,
      logoUrl: logo,
      whatsappNumber,
    })
    .where(eq(businesses.id, business.id))
    .returning({
      name: businesses.name,
      logoUrl: businesses.logoUrl,
      description: businesses.description,
      reviewThemes: businesses.reviewThemes,
      whatsappNumber: businesses.whatsappNumber,
    });

  return NextResponse.json({ business: updated });
}
