import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { businesses } from "@/db/schema";
import { verifyWebhookSignature, type RazorpaySubscription } from "@/lib/razorpay";
import { applySubscriptionSnapshot } from "@/lib/subscriptionSync";
import { eq } from "drizzle-orm";

type WebhookPayload = {
  event?: string;
  payload?: {
    subscription?: { entity?: RazorpaySubscription & { notes?: Record<string, string> } };
    payment?: { entity?: { notes?: Record<string, string> } };
  };
};

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature");
  const valid = await verifyWebhookSignature(rawBody, signature);
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let data: WebhookPayload = {};
  try {
    data = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = data.event ?? "";
  const sub = data.payload?.subscription?.entity;
  if (!sub?.id) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const businessId = sub.notes?.businessId;
  let business =
    businessId
      ? (
          await db.select().from(businesses).where(eq(businesses.id, businessId)).limit(1)
        )[0]
      : null;

  if (!business) {
    const [bySub] = await db
      .select()
      .from(businesses)
      .where(eq(businesses.razorpaySubscriptionId, sub.id))
      .limit(1);
    business = bySub ?? null;
  }

  if (!business) {
    return NextResponse.json({ ok: true, unmatched: true });
  }

  // Keep status in sync for charge / activate / halt / cancel events.
  if (
    event.startsWith("subscription.") ||
    event === "subscription.charged" ||
    event === "subscription.activated" ||
    event === "subscription.authenticated" ||
    event === "subscription.pending" ||
    event === "subscription.halted" ||
    event === "subscription.cancelled" ||
    event === "subscription.completed" ||
    event === "subscription.paused" ||
    event === "subscription.resumed"
  ) {
    await applySubscriptionSnapshot(business.id, sub, {
      extendPaidUntilYears: event === "subscription.charged" ? 1 : undefined,
    });
  }

  return NextResponse.json({ ok: true });
}
