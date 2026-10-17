import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { reviewSessions } from "@/db/schema";
import { eq } from "drizzle-orm";

type Body = {
  action: "post" | "whatsapp";
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { action }: Body = await req.json();

    if (action !== "post" && action !== "whatsapp") {
      return NextResponse.json({ error: "action must be post or whatsapp" }, { status: 400 });
    }

    const [existing] = await db
      .select({
        id: reviewSessions.id,
        postedAt: reviewSessions.postedAt,
        whatsappClickedAt: reviewSessions.whatsappClickedAt,
      })
      .from(reviewSessions)
      .where(eq(reviewSessions.id, id));

    if (!existing) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const now = new Date();
    if (action === "post") {
      if (!existing.postedAt) {
        await db
          .update(reviewSessions)
          .set({ postedAt: now })
          .where(eq(reviewSessions.id, id));
      }
    } else if (!existing.whatsappClickedAt) {
      await db
        .update(reviewSessions)
        .set({ whatsappClickedAt: now })
        .where(eq(reviewSessions.id, id));
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Review session action error:", err);
    return NextResponse.json({ error: "Could not record action" }, { status: 500 });
  }
}
