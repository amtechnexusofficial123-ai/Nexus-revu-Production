import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { businesses } from "@/db/schema";
import { getSessionAdminId } from "@/lib/auth";
import { ensureBusinessBacklog, getBacklogStatus } from "@/lib/reviewBacklog";
import { and, eq } from "drizzle-orm";

async function loadOwned(id: string, adminId: string) {
  const [business] = await db
    .select({ id: businesses.id })
    .from(businesses)
    .where(and(eq(businesses.id, id), eq(businesses.adminId, adminId)));
  return business ?? null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminId = await getSessionAdminId();
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const business = await loadOwned(id, adminId);
  if (!business) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const backlog = await getBacklogStatus(id);
  return NextResponse.json({ backlog });
}

/** Force-load / refill backlog reviews for this business (bypasses 30m cooldown). */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminId = await getSessionAdminId();
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const business = await loadOwned(id, adminId);
  if (!business) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await ensureBusinessBacklog(id, { force: true });
    const backlog = await getBacklogStatus(id);
    return NextResponse.json({
      ok: true,
      backlog,
      message:
        backlog.total >= backlog.target
          ? `Backlog ready (${backlog.total}/${backlog.target}).`
          : `Loaded ${backlog.total}/${backlog.target}. Some drafts may still be missing if Gemini failed.`,
    });
  } catch (err) {
    console.error("Manual backlog load failed:", err);
    const backlog = await getBacklogStatus(id);
    return NextResponse.json(
      {
        error: "Could not fully load backlog reviews. Try again in a few minutes.",
        backlog,
      },
      { status: 500 }
    );
  }
}
