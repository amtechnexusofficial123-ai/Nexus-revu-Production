import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { reviewSessions } from "@/db/schema";
import { checkPostVelocity } from "@/lib/reviewVelocity";
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
        businessId: reviewSessions.businessId,
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
        const velocity = await checkPostVelocity(existing.businessId);
        if (velocity.exceeded) {
          // Still ok:true so clipboard + Google open aren't blocked client-side;
          // we just skip recording another post in a burst window.
          return NextResponse.json({
            ok: true,
            velocityLimited: true,
            message: velocity.message,
          });
        }
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
