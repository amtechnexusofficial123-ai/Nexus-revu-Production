import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { businesses } from "@/db/schema";
import { getSessionAdminId } from "@/lib/auth";
import { generateQrDataUrl } from "@/lib/qr";
import { nanoid } from "nanoid";
import { eq, and } from "drizzle-orm";

async function ensureManageToken(business: typeof businesses.$inferSelect) {
  if (business.manageToken) return business;
  const manageToken = nanoid(24);
  const [updated] = await db
    .update(businesses)
    .set({ manageToken })
    .where(eq(businesses.id, business.id))
    .returning();
  return updated;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getSessionAdminId();
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const [row] = await db
    .select()
    .from(businesses)
    .where(and(eq(businesses.id, id), eq(businesses.adminId, adminId)));

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const business = await ensureManageToken(row);
  const origin = new URL(req.url).origin;

  const reviewUrl = `${origin}/r/${business.slug}`;
  const manageUrl = `${origin}/q/${business.manageToken}`;

  const [reviewQrDataUrl, manageQrDataUrl] = await Promise.all([
    generateQrDataUrl(reviewUrl),
    generateQrDataUrl(manageUrl),
  ]);

  return NextResponse.json({
    reviewQrDataUrl,
    reviewUrl,
    manageQrDataUrl,
    manageUrl,
    // keep old keys so nothing else breaks mid-refactor
    qrDataUrl: reviewQrDataUrl,
  });
}
