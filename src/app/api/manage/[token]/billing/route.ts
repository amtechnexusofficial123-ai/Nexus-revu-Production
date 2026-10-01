import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { businesses } from "@/db/schema";
import { billingPublicStatus } from "@/lib/billing";
import {
  cancelRazorpaySubscription,
  createRazorpaySubscription,
  getRazorpayKeyId,
  isRazorpayConfigured,
  verifySubscriptionPaymentSignature,
} from "@/lib/razorpay";
import { applySubscriptionSnapshot, confirmPaidSubscriptionFromRazorpay } from "@/lib/subscriptionSync";
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
    businessName: business.name,
    ...billingPublicStatus(business),
    razorpayConfigured: isRazorpayConfigured(),
    keyId: business.billingMode === "razorpay" ? getRazorpayKeyId() : null,
  });
}

/** Create / confirm / cancel Razorpay subscription. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const business = await loadByToken(token);
    if (!business) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (business.billingMode !== "razorpay") {
      return NextResponse.json({ error: "This business uses manual billing" }, { status: 400 });
    }
    if (!isRazorpayConfigured()) {
      return NextResponse.json({ error: "Payments are not configured yet" }, { status: 503 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      razorpay_payment_id?: string;
      razorpay_subscription_id?: string;
      razorpay_signature?: string;
    };

    // Confirm checkout payment and refresh subscription state.
    if (body.action === "confirm") {
      const paymentId = body.razorpay_payment_id?.trim();
      const subscriptionId = body.razorpay_subscription_id?.trim();
      const signature = body.razorpay_signature?.trim();
      if (!paymentId || !subscriptionId || !signature) {
        return NextResponse.json({ error: "Missing payment confirmation fields" }, { status: 400 });
      }
      const ok = await verifySubscriptionPaymentSignature({
        paymentId,
        subscriptionId,
        signature,
      });
      if (!ok) {
        return NextResponse.json({ error: "Invalid payment signature" }, { status: 400 });
      }

      const updated = await confirmPaidSubscriptionFromRazorpay(business.id, subscriptionId);
      return NextResponse.json({
        ok: true,
        ...billingPublicStatus(updated ?? business),
      });
    }

    // Cancel auto-renew at end of current paid cycle.
    if (body.action === "cancel") {
      const subscriptionId = business.razorpaySubscriptionId?.trim();
      if (!subscriptionId) {
        return NextResponse.json({ error: "No subscription to cancel" }, { status: 400 });
      }
      const status = billingPublicStatus(business);
      if (!status.canCancel) {
        return NextResponse.json(
          {
            error: status.cancelScheduled
              ? "Subscription is already set to cancel"
              : "Nothing to cancel",
            ...status,
          },
          { status: 400 }
        );
      }

      // Stop future renewals immediately; paidUntil keeps access until the paid year ends.
      const sub = await cancelRazorpaySubscription(subscriptionId, { cancelAtCycleEnd: false });
      const updated = await applySubscriptionSnapshot(business.id, sub);
      return NextResponse.json({
        ok: true,
        cancelled: true,
        ...billingPublicStatus(updated ?? business),
      });
    }

    // Already paid — do not create another subscription that would clobber status.
    const current = billingPublicStatus(business);
    if (current.subscriptionPaid) {
      return NextResponse.json({
        alreadyPaid: true,
        ...current,
        keyId: getRazorpayKeyId(),
        businessName: business.name,
      });
    }

    // Reuse only a still-open unpaid checkout sub. Never reuse cancelled/expired.
    const existingId = business.razorpaySubscriptionId?.trim();
    const existingStatus = (business.razorpaySubscriptionStatus ?? "").toLowerCase();
    const reusable =
      existingId &&
      (existingStatus === "created" || existingStatus === "pending" || existingStatus === "");
    if (reusable) {
      return NextResponse.json({
        keyId: getRazorpayKeyId(),
        subscriptionId: existingId,
        shortUrl: null,
        businessName: business.name,
        reused: true,
      });
    }

    // Stale cancelled/halted id — clear before creating a fresh subscription.
    if (existingId) {
      await db
        .update(businesses)
        .set({
          razorpaySubscriptionId: null,
          razorpaySubscriptionStatus: null,
        })
        .where(eq(businesses.id, business.id));
    }

    // Create a new subscription for checkout.
    const yearlyAmount = billingPublicStatus(business).yearlyAmount;
    const sub = await createRazorpaySubscription(
      {
        businessId: business.id,
        businessSlug: business.slug,
        businessName: business.name,
      },
      { yearlyAmountInr: yearlyAmount }
    );

    // Store the pending subscription id without wiping a future paidUntil if present.
    await db
      .update(businesses)
      .set({
        razorpaySubscriptionId: sub.id,
        razorpaySubscriptionStatus: (sub.status || "created").toLowerCase(),
      })
      .where(eq(businesses.id, business.id));

    return NextResponse.json({
      keyId: getRazorpayKeyId(),
      subscriptionId: sub.id,
      shortUrl: sub.short_url ?? null,
      businessName: business.name,
    });
  } catch (err) {
    console.error("manage billing POST failed", err);
    const message =
      err instanceof Error && err.message
        ? err.message
        : "Could not start payment";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
