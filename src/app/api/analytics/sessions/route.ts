import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { businesses, reviewSessions } from "@/db/schema";
import { getSessionAdminId } from "@/lib/auth";
import { and, desc, eq, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const adminId = await getSessionAdminId();
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const businessId = req.nextUrl.searchParams.get("businessId");

  const ownedBusinesses = await db
    .select({
      id: businesses.id,
      name: businesses.name,
    })
    .from(businesses)
    .where(eq(businesses.adminId, adminId))
    .orderBy(businesses.name);

  const businessIds = ownedBusinesses.map((b) => b.id);
  if (businessIds.length === 0) {
    return NextResponse.json({ businesses: [], sessions: [], summary: [] });
  }

  if (businessId && !businessIds.includes(businessId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const filterBusinessId = businessId ?? null;

  const sessions = await db
    .select({
      id: reviewSessions.id,
      businessId: reviewSessions.businessId,
      businessName: businesses.name,
      draftText: reviewSessions.draftText,
      sentiment: reviewSessions.sentiment,
      answers: reviewSessions.answers,
      postedAt: reviewSessions.postedAt,
      whatsappClickedAt: reviewSessions.whatsappClickedAt,
      createdAt: reviewSessions.createdAt,
    })
    .from(reviewSessions)
    .innerJoin(businesses, eq(reviewSessions.businessId, businesses.id))
    .where(
      filterBusinessId
        ? and(eq(businesses.adminId, adminId), eq(reviewSessions.businessId, filterBusinessId))
        : eq(businesses.adminId, adminId)
    )
    .orderBy(desc(reviewSessions.createdAt))
    .limit(200);

  const summaryRows = await db
    .select({
      businessId: businesses.id,
      businessName: businesses.name,
      drafts: sql<number>`count(${reviewSessions.id})::int`,
      posts: sql<number>`count(${reviewSessions.postedAt})::int`,
      whatsapp: sql<number>`count(${reviewSessions.whatsappClickedAt})::int`,
    })
    .from(businesses)
    .leftJoin(reviewSessions, eq(reviewSessions.businessId, businesses.id))
    .where(
      filterBusinessId
        ? and(eq(businesses.adminId, adminId), eq(businesses.id, filterBusinessId))
        : eq(businesses.adminId, adminId)
    )
    .groupBy(businesses.id, businesses.name)
    .orderBy(businesses.name);

  return NextResponse.json({
    businesses: ownedBusinesses,
    sessions,
    summary: summaryRows,
  });
}
