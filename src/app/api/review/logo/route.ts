import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { businesses } from "@/db/schema";
import { isCustomerQrActive } from "@/lib/billing";
import { eq } from "drizzle-orm";

/**
 * Serves the business logo as raw image bytes so the questions JSON
 * never embeds large base64 data URLs (those were truncating ~16KB on mobile).
 */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

  const [business] = await db
    .select({
      logoUrl: businesses.logoUrl,
      enabled: businesses.enabled,
      billingMode: businesses.billingMode,
      razorpaySubscriptionStatus: businesses.razorpaySubscriptionStatus,
      paidUntil: businesses.paidUntil,
    })
    .from(businesses)
    .where(eq(businesses.slug, slug));

  if (!business?.logoUrl || !isCustomerQrActive(business)) {
    return new NextResponse(null, { status: 404 });
  }

  const logo = business.logoUrl;

  if (logo.startsWith("http://") || logo.startsWith("https://")) {
    return NextResponse.redirect(logo, 302);
  }

  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(logo);
  if (!match) {
    return new NextResponse(null, { status: 404 });
  }

  const contentType = match[1];
  const binary = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));

  return new NextResponse(binary, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
