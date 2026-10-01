import { db } from "@/db";
import { businesses } from "@/db/schema";
import {
  fetchRazorpaySubscription,
  unixToDate,
  type RazorpaySubscription,
} from "@/lib/razorpay";
import { eq } from "drizzle-orm";

const ACTIVE = new Set(["active", "authenticated"]);
const TERMINAL = new Set(["cancelled", "completed", "expired"]);

export async function applySubscriptionSnapshot(
  businessId: string,
  sub: RazorpaySubscription,
  options?: { extendPaidUntilYears?: number; forcePaidAfterCheckout?: boolean }
) {
  let status = (sub.status || "").toLowerCase();
  let paidUntil = unixToDate(sub.current_end ?? null) ?? unixToDate(sub.charge_at ?? null);

  // After first charge, Razorpay may not always send current_end immediately —
  // fall back to +1 year from now when status is paid-like.
  if (!paidUntil && ACTIVE.has(status)) {
    const years = options?.extendPaidUntilYears ?? 1;
    paidUntil = new Date();
    paidUntil.setFullYear(paidUntil.getFullYear() + years);
  }

  // Checkout signature already proved payment — don't wait on webhook lag.
  if (options?.forcePaidAfterCheckout) {
    if (!paidUntil) {
      const years = options.extendPaidUntilYears ?? 1;
      paidUntil = new Date();
      paidUntil.setFullYear(paidUntil.getFullYear() + years);
    }
    if (!ACTIVE.has(status) && !TERMINAL.has(status)) {
      status = "authenticated";
    }
  }

  const [updated] = await db
    .update(businesses)
    .set({
      razorpaySubscriptionId: sub.id,
      razorpaySubscriptionStatus: status || null,
      ...(paidUntil ? { paidUntil } : {}),
    })
    .where(eq(businesses.id, businessId))
    .returning();

  return updated;
}

export async function refreshSubscriptionFromRazorpay(
  businessId: string,
  subscriptionId: string,
  options?: { extendPaidUntilYears?: number; forcePaidAfterCheckout?: boolean }
) {
  const sub = await fetchRazorpaySubscription(subscriptionId);
  return applySubscriptionSnapshot(businessId, sub, options);
}

/**
 * After checkout signature verification: mark paid immediately.
 * Do not poll Razorpay here — that delayed the UI after payment.
 */
export async function confirmPaidSubscriptionFromRazorpay(
  businessId: string,
  subscriptionId: string
) {
  const sub = await fetchRazorpaySubscription(subscriptionId);
  return applySubscriptionSnapshot(businessId, sub, {
    extendPaidUntilYears: 1,
    forcePaidAfterCheckout: true,
  });
}
