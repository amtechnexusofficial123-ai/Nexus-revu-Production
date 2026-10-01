import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { appErrors, businesses } from "@/db/schema";
import { getSessionAdminId } from "@/lib/auth";
import { desc, eq, inArray, or } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const adminId = await getSessionAdminId();
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const businessId = req.nextUrl.searchParams.get("businessId");

  const ownedBusinesses = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      slug: businesses.slug,
    })
    .from(businesses)
    .where(eq(businesses.adminId, adminId))
    .orderBy(businesses.name);

  const businessIds = ownedBusinesses.map((b) => b.id);
  const ownedSlugs = ownedBusinesses.map((b) => b.slug);

  if (businessId && !businessIds.includes(businessId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (businessIds.length === 0) {
    return NextResponse.json({ businesses: [], errors: [] });
  }

  const ownershipFilter = businessId
    ? eq(appErrors.businessId, businessId)
    : or(
        inArray(appErrors.businessId, businessIds),
        ownedSlugs.length ? inArray(appErrors.slug, ownedSlugs) : undefined
      );

  const rows = await db
    .select({
      id: appErrors.id,
      businessId: appErrors.businessId,
      businessName: businesses.name,
      slug: appErrors.slug,
      source: appErrors.source,
      message: appErrors.message,
      detail: appErrors.detail,
      createdAt: appErrors.createdAt,
    })
    .from(appErrors)
    .leftJoin(businesses, eq(appErrors.businessId, businesses.id))
    .where(ownershipFilter)
    .orderBy(desc(appErrors.createdAt))
    .limit(200);

  return NextResponse.json({
    businesses: ownedBusinesses.map(({ id, name }) => ({ id, name })),
    errors: rows,
  });
}
