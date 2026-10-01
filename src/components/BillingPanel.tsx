"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

let razorpayScriptPromise: Promise<boolean> | null = null;

/** Load checkout.js once; safe to call repeatedly. */
export function loadRazorpayScript(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  if (razorpayScriptPromise) return razorpayScriptPromise;

  razorpayScriptPromise = new Promise((resolve) => {
    const finish = (ok: boolean) => {
      if (!ok) razorpayScriptPromise = null;
      resolve(ok);
    };

    if (window.Razorpay) {
      finish(true);
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>('script[data-razorpay="1"]');
    if (existing) {
      if (window.Razorpay) {
        finish(true);
        return;
      }
      existing.addEventListener("load", () => finish(Boolean(window.Razorpay)));
      existing.addEventListener("error", () => finish(false));
      // Already finished loading before listeners were attached.
      if (existing.dataset.loaded === "1" || existing.getAttribute("data-loaded") === "1") {
        finish(Boolean(window.Razorpay));
      }
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.dataset.razorpay = "1";
    script.onload = () => {
      script.dataset.loaded = "1";
      finish(Boolean(window.Razorpay));
    };
    script.onerror = () => finish(false);
    document.body.appendChild(script);
  });

  return razorpayScriptPromise;
}

function formatInDate(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

type BillingPayload = {
  billingMode?: string;
  subscriptionPaid?: boolean;
  paidUntil?: string | null;
  canCancel?: boolean;
  cancelScheduled?: boolean;
  businessName?: string;
  yearlyAmount?: number;
  yearlyAmountLabel?: string;
};

type CheckoutParams = {
  keyId: string;
  subscriptionId: string;
  businessName: string;
};

export function BillingPanel({
  token,
  autoLoad = true,
  header,
}: {
  token: string;
  autoLoad?: boolean;
  header?: ReactNode;
}) {
  const [billingMode, setBillingMode] = useState<"manual" | "razorpay">("manual");
  const [yearlyAmountLabel, setYearlyAmountLabel] = useState("₹2,500");
  const [subscriptionPaid, setSubscriptionPaid] = useState(false);
  const [paidUntil, setPaidUntil] = useState<string | null>(null);
  const [canCancel, setCanCancel] = useState(false);
  const [cancelScheduled, setCancelScheduled] = useState(false);
  const [paying, setPaying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [billingMessage, setBillingMessage] = useState<string | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [loading, setLoading] = useState(autoLoad);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState("");
  const checkoutRef = useRef<CheckoutParams | null>(null);
  const checkoutInflightRef = useRef<Promise<CheckoutParams> | null>(null);

  const applyBillingPayload = useCallback((data: BillingPayload) => {
    setBillingMode(data.billingMode === "razorpay" ? "razorpay" : "manual");
    setSubscriptionPaid(Boolean(data.subscriptionPaid));
    setPaidUntil(data.paidUntil ?? null);
    setCanCancel(Boolean(data.canCancel));
    setCancelScheduled(Boolean(data.cancelScheduled));
    if (data.yearlyAmountLabel) setYearlyAmountLabel(data.yearlyAmountLabel);
    else if (typeof data.yearlyAmount === "number") {
      setYearlyAmountLabel(`₹${data.yearlyAmount.toLocaleString("en-IN")}`);
    }
    if (data.businessName) setBusinessName(data.businessName);
  }, []);

  const refreshBilling = useCallback(async () => {
    const res = await fetch(`/api/manage/${encodeURIComponent(token)}/billing`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Could not load billing");
    applyBillingPayload(data);
    return data;
  }, [token, applyBillingPayload]);

  const startCheckoutSession = useCallback(async (): Promise<CheckoutParams> => {
    if (checkoutRef.current) return checkoutRef.current;
    if (checkoutInflightRef.current) return checkoutInflightRef.current;

    const inflight = (async () => {
      const res = await fetch(`/api/manage/${encodeURIComponent(token)}/billing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not start payment");

      if (data.alreadyPaid) {
        applyBillingPayload(data);
        throw new Error("ALREADY_PAID");
      }

      const params: CheckoutParams = {
        keyId: data.keyId,
        subscriptionId: data.subscriptionId,
        businessName: data.businessName ?? "NexusRevu",
      };
      checkoutRef.current = params;
      return params;
    })().finally(() => {
      checkoutInflightRef.current = null;
    });

    checkoutInflightRef.current = inflight;
    return inflight;
  }, [token, applyBillingPayload]);

  useEffect(() => {
    if (!autoLoad) return;
    setLoading(true);
    setLoadError(null);
    refreshBilling()
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : "Could not load billing");
      })
      .finally(() => setLoading(false));
  }, [autoLoad, refreshBilling]);

  // Warm Razorpay checkout.js only — do not create a subscription until Pay.
  useEffect(() => {
    if (loading || loadError) return;
    if (billingMode !== "razorpay" || subscriptionPaid) return;
    void loadRazorpayScript();
  }, [loading, loadError, billingMode, subscriptionPaid]);

  async function handleCancelSubscription() {
    const untilLabel = formatInDate(paidUntil) ?? "the end of your paid period";
    const ok = window.confirm(
      `Cancel auto-renewal?\n\nYour plan will stay active until ${untilLabel}. It will not renew after that.`
    );
    if (!ok) return;

    setBillingError(null);
    setBillingMessage(null);
    setCancelling(true);
    try {
      const res = await fetch(`/api/manage/${encodeURIComponent(token)}/billing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not cancel subscription");
      applyBillingPayload(data);
      checkoutRef.current = null;
      setBillingMessage(
        `Subscription cancelled. Your plan stays active until ${
          formatInDate(data.paidUntil) ?? untilLabel
        }.`
      );
    } catch (err) {
      setBillingError(err instanceof Error ? err.message : "Could not cancel subscription");
      try {
        await refreshBilling();
      } catch {
        // ignore
      }
    } finally {
      setCancelling(false);
    }
  }

  async function handlePay() {
    setBillingError(null);
    setBillingMessage(null);
    setPaying(true);
    try {
      const [ready, checkout] = await Promise.all([
        loadRazorpayScript(),
        startCheckoutSession().catch((err) => {
          if (err instanceof Error && err.message === "ALREADY_PAID") {
            setBillingMessage("Your yearly plan is already active.");
            return null;
          }
          throw err;
        }),
      ]);

      if (!checkout) return;
      if (!ready || !window.Razorpay) {
        throw new Error("Could not load Razorpay checkout");
      }

      await new Promise<void>((resolve, reject) => {
        const rzp = new window.Razorpay!({
          key: checkout.keyId,
          subscription_id: checkout.subscriptionId,
          name: "NexusRevu",
          description: `Yearly plan for ${checkout.businessName}`,
          handler: async (response: {
            razorpay_payment_id: string;
            razorpay_subscription_id: string;
            razorpay_signature: string;
          }) => {
            try {
              const confirmRes = await fetch(`/api/manage/${encodeURIComponent(token)}/billing`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: "confirm",
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_subscription_id: response.razorpay_subscription_id,
                  razorpay_signature: response.razorpay_signature,
                }),
              });
              const confirmData = await confirmRes.json().catch(() => ({}));
              if (!confirmRes.ok) {
                reject(new Error(confirmData.error ?? "Payment confirmation failed"));
                return;
              }
              applyBillingPayload(confirmData);
              checkoutRef.current = null;
              if (!confirmData.subscriptionPaid) {
                setSubscriptionPaid(true);
                setPaidUntil(
                  confirmData.paidUntil ??
                    new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
                );
                setCanCancel(true);
                setCancelScheduled(false);
              }
              setBillingMessage("Payment successful. Your plan is active for one year.");
              resolve();
            } catch (err) {
              reject(err instanceof Error ? err : new Error("Payment confirmation failed"));
            }
          },
          modal: {
            ondismiss: () => reject(new Error("Payment cancelled")),
          },
        });
        rzp.open();
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Payment failed";
      if (msg !== "Payment cancelled") {
        setBillingError(msg);
        checkoutRef.current = null;
      } else {
        setBillingMessage("Payment cancelled.");
      }
      try {
        await refreshBilling();
      } catch {
        // ignore
      }
    } finally {
      setPaying(false);
    }
  }

  if (loading) {
    return <p className="px-4 py-8 text-center text-sm text-ink/55">Loading billing…</p>;
  }

  if (loadError) {
    return <p className="px-4 py-8 text-center text-sm text-red-600">{loadError}</p>;
  }

  if (billingMode !== "razorpay") {
    return (
      <p className="px-4 py-8 text-center text-sm text-ink/55">
        This business uses manual billing. No online payment is required.
      </p>
    );
  }

  const untilLabel = formatInDate(paidUntil);

  return (
    <div className="flex flex-1 flex-col px-4 py-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      {header}
      {!header && businessName && (
        <p className="mb-4 text-center text-sm text-ink/60">{businessName}</p>
      )}

      <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm">
        <div className="border-b border-ink/10 bg-brand-light/60 px-4 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-brand">Plan</p>
          <p className="mt-1 font-display text-xl text-ink">NexusRevu Yearly</p>
        </div>

        <table className="w-full text-left text-sm">
          <tbody>
            <tr className="border-b border-ink/8">
              <th className="px-4 py-3.5 font-medium text-ink/55" scope="row">
                Amount
              </th>
              <td className="px-4 py-3.5 text-right font-display text-lg text-ink">
                {yearlyAmountLabel}
              </td>
            </tr>
            <tr className="border-b border-ink/8">
              <th className="px-4 py-3.5 font-medium text-ink/55" scope="row">
                Duration
              </th>
              <td className="px-4 py-3.5 text-right font-medium text-ink">1 year</td>
            </tr>
            <tr className="border-b border-ink/8">
              <th className="px-4 py-3.5 font-medium text-ink/55" scope="row">
                Plan status
              </th>
              <td className="px-4 py-3.5 text-right font-medium text-ink">
                {subscriptionPaid ? (
                  <span className="text-emerald-700">Active</span>
                ) : (
                  <span className="text-ink/55">Not paid</span>
                )}
              </td>
            </tr>
            {subscriptionPaid && (
              <tr>
                <th className="px-4 py-3.5 font-medium text-ink/55" scope="row">
                  {cancelScheduled ? "Access until" : "Next renewal"}
                </th>
                <td className="px-4 py-3.5 text-right font-medium text-ink">
                  {untilLabel ?? "—"}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="border-t border-ink/10 px-4 py-4">
          {subscriptionPaid ? (
            <p className="text-center text-sm text-ink/60">
              {cancelScheduled
                ? `Auto-renew is off. Your plan stays active until ${
                    untilLabel ?? "the end of the paid period"
                  }.`
                : `Your yearly plan is active${untilLabel ? ` until ${untilLabel}` : ""}.`}
            </p>
          ) : (
            <button
              type="button"
              className="btn-primary min-h-[52px] w-full text-sm"
              disabled={paying}
              onClick={handlePay}
            >
              {paying ? "Opening Razorpay…" : "Pay yearly subscription"}
            </button>
          )}
          {billingError && <p className="mt-3 text-center text-sm text-red-600">{billingError}</p>}
          {billingMessage && <p className="mt-3 text-center text-sm text-brand">{billingMessage}</p>}
        </div>
      </div>

      {canCancel && (
        <div className="mt-6 px-1 pb-2 text-center">
          <button
            type="button"
            className="text-sm text-ink/45 underline-offset-2 hover:text-red-700 hover:underline disabled:opacity-50"
            disabled={cancelling}
            onClick={handleCancelSubscription}
          >
            {cancelling ? "Cancelling…" : "Cancel subscription"}
          </button>
        </div>
      )}
    </div>
  );
}
