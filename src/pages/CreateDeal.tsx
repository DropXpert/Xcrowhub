import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import { SkeletonDots } from "@/components/LoadingStates";
import { useDealStore } from "@/store/dealStore";
import { useAuthStore } from "@/store/authStore";
import { PageHeader } from "@/components/PageHeader";
import { Field } from "@/components/Field";
import { ConsentCheck } from "@/components/ConsentCheck";
import { WalletAddressBadge } from "@/components/WalletAddressBadge";
import { AlertDialog } from "@/components/AlertDialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { isCustodyAddress } from "@/lib/config";
import {
  ACTIVE_DEAL_LIMIT,
  ACTIVE_DEAL_LIMIT_MESSAGE,
  countActiveSellerDeals,
} from "@/lib/dealLimits";
import type { Currency, DealCategory } from "@/types/deal";
import { DEAL_CATEGORIES, CATEGORY_LABELS } from "@/types/deal";
import { CATEGORY_ICON } from "@/lib/categoryIcons";

interface FormState {
  title: string;
  description: string;
  priceAmount: string;
  priceCurrency: Currency;
  category: DealCategory;
  deliveryDeadlineHours: string;
  confirmationWindowHours: string;
  requiredDeliveryProof: string;
  refundTerms: string;
}

const initialState: FormState = {
  title: "",
  description: "",
  priceAmount: "",
  priceCurrency: "USDT",
  category: "other",
  deliveryDeadlineHours: "48",
  confirmationWindowHours: "24",
  requiredDeliveryProof: "",
  refundTerms: "",
};

export default function CreateDeal() {
  const navigate = useNavigate();
  const createDeal = useDealStore((s) => s.createDeal);
  const dealsMap = useDealStore((s) => s.deals);
  const loadFromSupabase = useDealStore((s) => s.loadFromSupabase);
  const session = useAuthStore((s) => s.session);
  const connect = useAuthStore((s) => s.connect);
  const authLoading = useAuthStore((s) => s.loading);
  const [form, setForm] = useState<FormState>(initialState);
  const [sellerAddress, setSellerAddress] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [agreed, setAgreed] = useState(false);
  // Confirm-before-create dialog. The user confirms the summary; the
  // actual createDeal() call happens in doCreate.
  const [confirmingCreate, setConfirmingCreate] = useState(false);
  const submitLock = useRef(false);

  useEffect(() => {
    void loadFromSupabase({ force: true });
  }, [loadFromSupabase]);

  useEffect(() => {
    // Use already-connected session address — avoids re-prompting the wallet
    if (session?.address && session.currency === form.priceCurrency) {
      setSellerAddress(session.address);
      return;
    }
    setSellerAddress("");
  }, [form.priceCurrency, session?.address, session?.currency]);

  const activeDealCount = useMemo(
    () => countActiveSellerDeals(Object.values(dealsMap), sellerAddress),
    [dealsMap, sellerAddress]
  );
  const activeDealLimitReached =
    sellerAddress.length > 0 && activeDealCount >= ACTIVE_DEAL_LIMIT;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Double-submit guard: ref (sync) + state (UI)
    if (submitLock.current || submitting) return;

    if (!form.title.trim()) return setError("Add a short title.");
    if (!form.priceAmount.trim() || Number(form.priceAmount) <= 0)
      return setError("Add a price greater than zero.");
    if (!form.requiredDeliveryProof.trim())
      return setError("Describe what counts as delivery.");
    if (!form.refundTerms.trim()) return setError("Add refund terms.");
    if (!agreed)
      return setError("Please confirm you understand how escrow works.");

    // Validation passed -- surface the confirm dialog; doCreate() does the
    // real work when the user taps "Create deal".
    setConfirmingCreate(true);
  }

  async function doCreate() {
    if (submitLock.current || submitting) return;
    submitLock.current = true;
    setSubmitting(true);
    setError(null);
    try {
      let nextSellerAddress = sellerAddress;
      if (!nextSellerAddress) {
        await connect(form.priceCurrency);
        const nextSession = useAuthStore.getState().session;
        if (nextSession?.currency === form.priceCurrency) {
          nextSellerAddress = nextSession.address;
          setSellerAddress(nextSellerAddress);
        }
      }
      if (!nextSellerAddress) {
        throw new Error(`Connect a ${form.priceCurrency} wallet first.`);
      }
      if (isCustodyAddress(form.priceCurrency, nextSellerAddress)) {
        throw new Error("Use your seller wallet, not the XcrowHub custody address.");
      }
      if (
        countActiveSellerDeals(
          Object.values(useDealStore.getState().deals),
          nextSellerAddress
        ) >= ACTIVE_DEAL_LIMIT
      ) {
        throw new Error(ACTIVE_DEAL_LIMIT_MESSAGE);
      }

      const deliveryHours = Math.max(1, Math.round(Number(form.deliveryDeadlineHours) || 48));
      const confirmHours = Math.max(1, Math.round(Number(form.confirmationWindowHours) || 24));

      const deal = await Promise.resolve(createDeal({
        title: form.title,
        description: form.description,
        priceAmount: String(Number(form.priceAmount)),
        priceCurrency: form.priceCurrency,
        category: form.category,
        sellerWalletAddress: nextSellerAddress,
        deliveryDeadlineHours: deliveryHours,
        confirmationWindowHours: confirmHours,
        requiredDeliveryProof: form.requiredDeliveryProof,
        refundTerms: form.refundTerms,
      }));

      setConfirmingCreate(false);
      navigate(`/deal/${deal.id}`, { replace: true });
    } catch (err: any) {
      setError(err.message || "Failed to create deal. Please try again.");
      setConfirmingCreate(false);
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="New deal"
        title="Create payment link"
        back="/create"
      />

      <form onSubmit={submit} className="space-y-5">
        <section className="card space-y-4 px-5 py-5" data-tour="deal-basics">
          <Field label="Title" required>
            <input
              className="input"
              placeholder="e.g. Logo design final files"
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              maxLength={120}
            />
          </Field>

          <Field label="Description" hint="Optional">
            <textarea
              className="textarea"
              placeholder="Extra details for the buyer"
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              maxLength={500}
            />
          </Field>

          <Field label="Price" required>
            <input
              className="input tabular-nums"
              type="number"
              inputMode="decimal"
              min="0"
              max="1000000000"
              step="0.01"
              placeholder="20"
              value={form.priceAmount}
              onChange={(e) => update("priceAmount", e.target.value)}
            />
          </Field>

          <Field label="Currency">
            <RadioGroup
              value={form.priceCurrency}
              onValueChange={(v) => update("priceCurrency", v as Currency)}
              className="grid grid-cols-2 gap-2"
            >
              {(["USDT", "NIM"] as Currency[]).map((c) => {
                const checked = form.priceCurrency === c;
                return (
                  <label
                    key={c}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 transition ${
                      checked
                        ? "border-accent bg-accent-soft"
                        : "border-edge bg-bg hover:border-edge/80"
                    }`}
                  >
                    <RadioGroupItem value={c} id={`currency-${c}`} />
                    <span className={`text-[13.5px] font-semibold ${checked ? "text-accent-ink" : "text-ink"}`}>
                      {c}
                    </span>
                  </label>
                );
              })}
            </RadioGroup>
          </Field>

          <Field label="Category">
            <RadioGroup
              value={form.category}
              onValueChange={(v) => update("category", v as DealCategory)}
              className="grid grid-cols-2 gap-2"
            >
              {DEAL_CATEGORIES.map((c) => {
                const checked = form.category === c;
                const Icon = CATEGORY_ICON[c];
                return (
                  <label
                    key={c}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 transition ${
                      checked
                        ? "border-accent bg-accent-soft"
                        : "border-edge bg-bg hover:border-edge/80"
                    }`}
                  >
                    <RadioGroupItem value={c} id={`category-${c}`} />
                    {Icon && (
                      <Icon
                        className={`h-3.5 w-3.5 ${checked ? "text-accent-ink" : "text-muted"}`}
                      />
                    )}
                    <span
                      className={`truncate text-[12.5px] font-medium ${
                        checked ? "text-accent-ink" : "text-ink"
                      }`}
                    >
                      {CATEGORY_LABELS[c]}
                    </span>
                  </label>
                );
              })}
            </RadioGroup>
          </Field>
        </section>

        <section className="card space-y-4 px-5 py-5" data-tour="deal-terms">
          <Field
            label="Delivery proof"
            required
            hint="What will the buyer check to confirm delivery?"
          >
            <textarea
              className="textarea"
              placeholder="e.g. Figma link + exported PNG / SVG files"
              value={form.requiredDeliveryProof}
              onChange={(e) =>
                update("requiredDeliveryProof", e.target.value)
              }
              maxLength={400}
            />
          </Field>

          <Field label="Refund terms" required>
            <textarea
              className="textarea"
              placeholder="e.g. Full refund if not delivered within 48 hours"
              value={form.refundTerms}
              onChange={(e) => update("refundTerms", e.target.value)}
              maxLength={400}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Delivery deadline (hrs)" required>
              <input
                className="input tabular-nums"
                type="number"
                min="1"
                max="8760"
                step="1"
                value={form.deliveryDeadlineHours}
                onChange={(e) =>
                  update("deliveryDeadlineHours", e.target.value)
                }
              />
            </Field>
            <Field label="Confirm window (hrs)" required>
              <input
                className="input tabular-nums"
                type="number"
                min="1"
                max="8760"
                step="1"
                value={form.confirmationWindowHours}
                onChange={(e) =>
                  update("confirmationWindowHours", e.target.value)
                }
              />
            </Field>
          </div>
        </section>

        <section className="card flex items-center justify-between gap-3 px-5 py-4" data-tour="deal-wallet">
          <p className="field-label">Payout wallet</p>
          {sellerAddress ? (
            <WalletAddressBadge address={sellerAddress} />
          ) : authLoading ? (
            <span className="inline-flex items-center gap-2 text-[12.5px] text-muted">
              <SkeletonDots label="Connecting payout wallet" />
              Connecting...
            </span>
          ) : (
            <button
              type="button"
              className="btn-secondary shrink-0 px-3 py-2 text-[12.5px]"
              onClick={() => connect(form.priceCurrency)}
            >
              Connect {form.priceCurrency}
            </button>
          )}
        </section>

        {sellerAddress ? (
          <p
            className={`text-[12.5px] ${
              activeDealLimitReached ? "text-danger" : "text-muted"
            }`}
          >
            {activeDealLimitReached
              ? ACTIVE_DEAL_LIMIT_MESSAGE
              : `${activeDealCount}/${ACTIVE_DEAL_LIMIT} active deals for this wallet.`}
          </p>
        ) : null}

        <ConsentCheck checked={agreed} onChange={setAgreed} />

        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          data-tour="deal-submit"
          className="btn-primary w-full"
          disabled={submitting || authLoading || activeDealLimitReached || !agreed}
        >
          {submitting
            ? <SkeletonDots label="Creating payment link" />
            : <Lock className="h-4 w-4" />}
          {submitting ? "Creating…" : "Create payment link"}
        </button>
      </form>

      {/* Confirm-before-create: a deal + payment link is generated the moment
          the user taps "Create deal", so the summary here doubles as their
          last chance to catch a wrong price or delivery window. */}
      <AlertDialog
        open={confirmingCreate}
        onOpenChange={(open) => {
          if (!open && submitting) return;
          setConfirmingCreate(open);
        }}
        title={`Create a deal for ${form.priceAmount || "0"} ${form.priceCurrency}?`}
        description={`"${form.title.trim() || "Untitled"}" — seller has ${Math.max(1, Math.round(Number(form.deliveryDeadlineHours) || 48))}h to deliver, buyer has ${Math.max(1, Math.round(Number(form.confirmationWindowHours) || 24))}h to confirm. A shareable payment link will be generated next.`}
        cancelLabel="Edit details"
        actionLabel={submitting ? "Creating…" : "Create deal"}
        onAction={doCreate}
        busy={submitting}
      />
    </div>
  );
}
