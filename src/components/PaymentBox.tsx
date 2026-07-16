import { useEffect, useRef, useState } from "react";
import { Lock, Loader2, ShieldCheck } from "lucide-react";
import type { Deal } from "@/types/deal";
import { useDealStore } from "@/store/dealStore";
import { useAuthStore } from "@/store/authStore";
import { getWallet } from "@/wallet";
import { isCustodyConfigured, custodyAddressFor } from "@/lib/config";
import { AlertDialog } from "@/components/AlertDialog";

const POLL_INTERVAL_MS = 5000;
const POLL_MAX_TRIES = 30; // ~2.5 min of automatic checking

export function PaymentBox({ deal }: { deal: Deal }) {
  const beginPayment = useDealStore((s) => s.beginPayment);
  const submitPayment = useDealStore((s) => s.submitPayment);
  const verifyPaymentNow = useDealStore((s) => s.verifyPaymentNow);
  const session = useAuthStore((s) => s.session);
  const connect = useAuthStore((s) => s.connect);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  // Confirm dialog stays mounted across the busy wallet-open phase so the
  // user sees a single "confirming payment…" state instead of a flicker
  // between dialog-closes and wallet-opens.
  const [confirmingPay, setConfirmingPay] = useState(false);
  const inFlight = useRef(false);
  const paymentsReady = isCustodyConfigured(deal.priceCurrency);

  // A payment has been sent + recorded once the deal carries a tx hash while
  // still awaiting_payment. In that state we stop offering "Pay" and instead
  // poll the verifier until the chain confirms it (→ funds_held).
  const verifying = deal.status === "awaiting_payment" && !!deal.paymentTxHash;

  // Auto-poll on-chain verification while a payment is pending confirmation.
  useEffect(() => {
    if (!verifying) return;
    let cancelled = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (cancelled) return;
      tries += 1;
      setChecking(true);
      const done = await verifyPaymentNow(deal.id);
      setChecking(false);
      if (cancelled || done) return;
      if (tries < POLL_MAX_TRIES) timer = setTimeout(tick, POLL_INTERVAL_MS);
    };

    timer = setTimeout(tick, 2500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [verifying, deal.id, verifyPaymentNow]);

  async function checkNow() {
    if (checking) return;
    setChecking(true);
    await verifyPaymentNow(deal.id);
    setChecking(false);
  }

  async function handlePay() {
    if (inFlight.current || !paymentsReady) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const wallet = await getWallet(deal.priceCurrency);
      let buyer =
        session?.currency === deal.priceCurrency ? session.address : "";
      if (!buyer) {
        await connect(deal.priceCurrency);
        const nextSession = useAuthStore.getState().session;
        buyer =
          nextSession?.currency === deal.priceCurrency
            ? nextSession.address
            : "";
      }
      if (!buyer) {
        throw new Error(`Connect a ${deal.priceCurrency} wallet first.`);
      }
      // Bind the buyer and create a short, non-extendable reservation before
      // opening the wallet. A seller can no longer cancel in the gap between
      // chain broadcast and submission of the returned transaction hash.
      await beginPayment({
        dealId: deal.id,
        buyerWalletAddress: buyer,
      });
      const result = await wallet.sendPayment({
        to: custodyAddressFor(deal.priceCurrency),
        amount: deal.priceAmount,
        currency: deal.priceCurrency,
        memo: `XcrowHub ${deal.id}`,
      });
      // Records the tx hash; the deal stays awaiting_payment until the chain
      // confirms. The `verifying` effect above then polls to completion — we do
      // NOT navigate away or re-show the Pay button.
      await submitPayment({
        dealId: deal.id,
        buyerWalletAddress: buyer,
        paymentTxHash: result.txHash,
      });
    } catch (err) {
      console.error("[XcrowHub] payment failed:", err);
      setError(formatPaymentError(err));
    } finally {
      setBusy(false);
      // Close the confirm dialog only AFTER the async pay work resolves. On
      // success submitPayment has already flipped the deal into the verifying
      // state, which unmounts this "Pay" branch entirely; on failure we drop
      // back to the pay CTA with the error line visible.
      setConfirmingPay(false);
      inFlight.current = false;
    }
  }

  function formatPaymentError(err: unknown): string {
    if (isLowBalance(err)) return "Your balance is low for this transaction.";
    if (isRejected(err)) return "Transaction cancelled.";
    if (isAlreadyProcessing(err)) {
      return "A wallet request is already open. Finish it, then try again.";
    }

    const text = errorText(err);
    if (/network|chain|switch/i.test(text)) {
      return "Switch to the required network and try again.";
    }
    if (/wallet|nimiq pay/i.test(text)) return text;
    return "Payment failed. Please try again.";
  }

  function errorText(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === "string") return err;
    if (err && typeof err === "object") {
      const obj = err as Record<string, unknown>;
      const nested = obj.error as Record<string, unknown> | undefined;
      return [obj.message, nested?.message, nested?.reason, obj.reason]
        .filter((m): m is string => typeof m === "string")
        .join(" ");
    }
    return "";
  }

  function isLowBalance(err: unknown): boolean {
    return /insufficient|not enough|low balance|balance is too low|exceeds balance|transfer amount exceeds balance|funds/i.test(
      errorText(err)
    );
  }

  function isRejected(err: unknown): boolean {
    const text = errorText(err);
    if (/user rejected|user denied|rejected by user|cancelled|canceled/i.test(text)) return true;
    if (!err || typeof err !== "object") return false;
    const obj = err as Record<string, unknown>;
    const code = obj.code ?? (obj.error as Record<string, unknown> | undefined)?.code;
    return code === 4001;
  }

  function isAlreadyProcessing(err: unknown): boolean {
    if (!err || typeof err !== "object") return false;
    const obj = err as Record<string, unknown>;
    const code = obj.code ?? (obj.error as Record<string, unknown> | undefined)?.code;
    if (code === -32002) return true;
    return /already (processing|pending|in progress)|request.*(pending|in progress)|transaction already/i.test(
      errorText(err)
    );
  }

  // ── Verifying phase: payment sent, waiting for the chain to confirm ─────────
  if (verifying) {
    return (
      <section className="card space-y-4 px-5 py-5">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
            <Loader2 className="h-4 w-4 animate-spin" />
          </span>
          <div className="space-y-1">
            <h3 className="text-[15px] font-semibold text-ink">
              Confirming your payment
            </h3>
            <p className="text-[13px] leading-relaxed text-muted">
              We received your transaction and we're waiting for the network to
              confirm it. This usually takes under a minute — you don't need to
              pay again. This page updates automatically.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-dashed border-edge bg-bg p-3 space-y-1.5">
          <div className="flex items-baseline justify-between">
            <span className="text-[12.5px] uppercase tracking-wider text-muted">
              Amount sent
            </span>
            <span className="text-[15px] font-semibold tabular-nums text-ink">
              {deal.priceAmount}{" "}
              <span className="text-muted">{deal.priceCurrency}</span>
            </span>
          </div>
          <p className="truncate font-mono text-[11px] text-muted">
            tx {deal.paymentTxHash}
          </p>
        </div>

        <button
          type="button"
          onClick={checkNow}
          disabled={checking}
          className="btn-secondary w-full"
        >
          {checking ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking…
            </>
          ) : (
            "Check now"
          )}
        </button>

        <p className="text-[12.5px] leading-relaxed text-muted">
          Once confirmed, the seller is notified to deliver. If it hasn't
          updated after a few minutes, your transaction may still be pending on
          the network — it will confirm automatically.
        </p>
      </section>
    );
  }

  // ── Pay phase: no payment recorded yet ──────────────────────────────────────
  return (
    <section className="card space-y-4 px-5 py-5">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
          <Lock className="h-4 w-4" />
        </span>
        <div className="space-y-1">
          <h3 className="text-[15px] font-semibold text-ink">
            Pay into protected hold
          </h3>
          <p className="text-[13px] text-muted">
            Funds are held until the seller delivers and you confirm receipt.
            If anything goes wrong, you can raise a query.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-dashed border-edge bg-bg p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-[12.5px] uppercase tracking-wider text-muted">
            Amount
          </span>
          <span className="text-[17px] font-semibold tabular-nums text-ink">
            {deal.priceAmount}{" "}
            <span className="text-muted">{deal.priceCurrency}</span>
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          setError(null);
          setConfirmingPay(true);
        }}
        disabled={busy || !paymentsReady}
        className="btn-primary w-full"
      >
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Opening wallet…
          </>
        ) : (
          <>
            <ShieldCheck className="h-4 w-4" />
            Pay into XcrowHub
          </>
        )}
      </button>

      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <p className="text-[12.5px] leading-relaxed text-muted">
        {!paymentsReady
          ? "Payments are temporarily unavailable."
          : deal.priceCurrency === "NIM"
            ? "Open this page inside Nimiq Pay to pay with NIM. Funds go to XcrowHub custody and release when the deal confirms."
            : "Pay with USDT via your connected wallet. Funds go to XcrowHub custody and release when the deal confirms."}
      </p>

      {/* High-attention confirm before we actually open the wallet. The
          dialog is disabled during `busy` so a slow provider spin-up can't
          be double-tapped into two payment attempts. */}
      <AlertDialog
        open={confirmingPay}
        onOpenChange={(open) => {
          // Ignore close attempts while a payment is in flight -- the busy
          // flag on the action button already blocks the confirm path.
          if (!open && busy) return;
          setConfirmingPay(open);
        }}
        title={`Pay ${deal.priceAmount} ${deal.priceCurrency} into escrow?`}
        description={`Your wallet will open next. Funds go to XcrowHub custody and stay locked until you confirm delivery. This can't be undone once the transaction is broadcast.`}
        cancelLabel="Not yet"
        actionLabel={busy ? "Opening wallet…" : `Confirm & pay`}
        onAction={handlePay}
        busy={busy}
      />
    </section>
  );
}
