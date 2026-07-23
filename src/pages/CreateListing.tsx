import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Tag, X, Wallet, Check, ImagePlus, Trash2, ExternalLink } from "lucide-react";
import { useListingStore } from "@/store/listingStore";
import { useAuthStore } from "@/store/authStore";
import { PageHeader } from "@/components/PageHeader";
import { Field } from "@/components/Field";
import { ConsentCheck } from "@/components/ConsentCheck";
import { AlertDialog } from "@/components/AlertDialog";
import { SkeletonDots } from "@/components/LoadingStates";
import { isCustodyAddress } from "@/lib/config";
import {
  isNimiqPayHost,
  nimiqPayDeeplink,
  openNimiqPayOrStore,
} from "@/lib/host";
import { getWallet } from "@/wallet";
import type { Currency, DealCategory } from "@/types/deal";
import { DEAL_CATEGORIES, CATEGORY_LABELS } from "@/types/deal";
import { LISTING_IMAGE_MAX_SOURCE_BYTES, validateListingImage } from "@/lib/listingImages";

function shortAddr(addr: string) {
  const c = addr.replace(/\s+/g, "");
  return c.length <= 14 ? addr : `${c.slice(0, 7)}…${c.slice(-5)}`;
}

export default function CreateListing() {
  const navigate = useNavigate();
  const createListing = useListingStore((s) => s.createListing);
  const session = useAuthStore((s) => s.session);
  const connect = useAuthStore((s) => s.connect);
  const authLoading = useAuthStore((s) => s.loading);
  const inNimiqPay = isNimiqPayHost();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [priceAmount, setPriceAmount] = useState("");
  const [priceCurrency, setPriceCurrency] = useState<Currency>("USDT");
  const [quantityTotal, setQuantityTotal] = useState("1");
  const [category, setCategory] = useState<DealCategory>("other");
  const [deliveryHours, setDeliveryHours] = useState("48");
  const [confirmationHours, setConfirmationHours] = useState("24");
  const [requiredDeliveryProof, setRequiredDeliveryProof] = useState("");
  const [refundTerms, setRefundTerms] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [agreed, setAgreed] = useState(false);
  // Publish confirmation gate — the actual createListing() only runs after
  // the user confirms the summary in the AlertDialog.
  const [confirmingPublish, setConfirmingPublish] = useState(false);
  const [formTab, setFormTab] = useState<"details" | "delivery">("details");
  const submitLock = useRef(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!imageFile) {
      setImagePreview(null);
      return;
    }
    const preview = URL.createObjectURL(imageFile);
    setImagePreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [imageFile]);

  // The payout address is a currency-matched wallet used ONLY at release-time
  // to receive funds. It is separate from the login session so linking an
  // EVM wallet for a USDT listing does not clobber the NIM login identity
  // (which is what deals, listings, and the profile are keyed on).
  const [payoutAddr, setPayoutAddr] = useState("");
  const [linking, setLinking] = useState(false);

  // Auto-populate the payout address when the currency matches the login
  // wallet, so single-currency users don't see an extra "link wallet" step.
  useEffect(() => {
    const canUseSessionAddress =
      priceCurrency !== "USDT" || inNimiqPay;
    if (
      canUseSessionAddress &&
      session?.address &&
      session.currency === priceCurrency
    ) {
      setPayoutAddr(session.address);
      return;
    }
    setPayoutAddr("");
  }, [inNimiqPay, session?.address, session?.currency, priceCurrency]);

  async function linkPayoutWallet() {
    if (linking) return;
    setError(null);
    setLinking(true);
    try {
      if (priceCurrency === "USDT" && !inNimiqPay) {
        throw new Error(
          "Open this listing inside Nimiq Pay to use its USDT payout wallet."
        );
      }
      // Read the address from the currency-specific provider WITHOUT going
      // through authStore.connect() -- that would sign a new JWT and reset
      // the session's address, effectively making the user look like a
      // different account for everything else in the app.
      const wallet = await getWallet(priceCurrency);
      const addr = await wallet.getAddress();
      if (!addr) throw new Error(`Could not read ${priceCurrency} wallet address.`);
      if (isCustodyAddress(priceCurrency, addr)) {
        throw new Error("Use your seller wallet, not the XcrowHub custody address.");
      }
      setPayoutAddr(addr);
    } catch (err: any) {
      setError(err.message ?? `Could not link a ${priceCurrency} wallet.`);
    } finally {
      setLinking(false);
    }
  }

  function addTag() {
    const t = tagInput.trim().toLowerCase().replace(/\s+/g, "-");
    if (!t || tags.includes(t) || tags.length >= 5) return;
    setTags([...tags, t]);
    setTagInput("");
  }

  function chooseImage(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      validateListingImage(file);
      setImageFile(file);
    } catch (err: any) {
      setImageFile(null);
      setError(err.message ?? "Choose a valid product image.");
    } finally {
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (submitLock.current || submitting) return;

    if (!title.trim()) { setFormTab("details"); return setError("Add a title."); }
    if (!priceAmount || Number(priceAmount) <= 0) { setFormTab("details"); return setError("Add a price."); }
    if (!Number.isInteger(Number(quantityTotal)) || Number(quantityTotal) < 1) { setFormTab("details"); return setError("Quantity must be at least 1."); }
    if (!requiredDeliveryProof.trim()) { setFormTab("delivery"); return setError("Describe what counts as delivery."); }
    if (!refundTerms.trim()) { setFormTab("delivery"); return setError("Add refund terms."); }
    if (!agreed)
      return setError("Please confirm you understand how escrow works.");

    // All fields valid — hand off to the confirm dialog. Actual DB write
    // happens in doPublish once the user confirms.
    setConfirmingPublish(true);
  }

  async function doPublish() {
    if (submitLock.current || submitting) return;
    submitLock.current = true;
    setSubmitting(true);
    setError(null);
    try {
      // Owner identity comes from the login session -- keep it stable so
      // the seller's profile, other listings, and deals stay under the
      // same wallet regardless of which currencies they list in.
      if (!session?.address) {
        await connect();
        if (!useAuthStore.getState().session?.address) {
          throw new Error("Sign in with your wallet first.");
        }
      }
      const ownerAddr = useAuthStore.getState().session!.address;

      // Payout is currency-specific; single-currency users get it auto-set
      // to their login wallet, cross-currency users must have linked it
      // above via linkPayoutWallet().
      if (!payoutAddr) {
        throw new Error(`Link a ${priceCurrency} payout wallet first.`);
      }
      if (isCustodyAddress(priceCurrency, payoutAddr)) {
        throw new Error("Use your seller wallet, not the XcrowHub custody address.");
      }

      const listing = await createListing({
        sellerAddr: ownerAddr,
        payoutAddr,
        title: title.trim(),
        description: description.trim(),
        priceAmount: String(Number(priceAmount)),
        priceCurrency,
        quantityTotal: Number(quantityTotal),
        category,
        deliveryHours: Math.max(1, Number(deliveryHours) || 48),
        confirmationHours: Math.max(1, Number(confirmationHours) || 24),
        requiredDeliveryProof: requiredDeliveryProof.trim(),
        refundTerms: refundTerms.trim(),
        tags,
        imageFile,
      });
      setConfirmingPublish(false);
      navigate(`/listings/${listing.id}`);
    } catch (err: any) {
      setError(err.message ?? "Failed to create listing.");
      // Close the dialog on failure so the error is visible under the form,
      // not hidden behind the modal.
      setConfirmingPublish(false);
    } finally {
      setSubmitting(false);
      submitLock.current = false;
    }
  }

  return (
    <div className="space-y-5 lg:mx-auto lg:max-w-3xl">
      <PageHeader eyebrow="Marketplace" title="Create listing" back="/listings" />

      <form onSubmit={submit} className="space-y-5">
        <div className="form-tabs" role="tablist" aria-label="Listing details" data-tour="listing-tabs">
          <button
            type="button"
            role="tab"
            id="listing-details-tab"
            aria-selected={formTab === "details"}
            aria-controls="listing-details-panel"
            className="form-tab"
            onClick={() => { setFormTab("details"); setError(null); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                setFormTab("delivery");
                requestAnimationFrame(() => document.getElementById("listing-delivery-tab")?.focus());
              }
            }}
          >
            Listing details
          </button>
          <button
            type="button"
            role="tab"
            id="listing-delivery-tab"
            aria-selected={formTab === "delivery"}
            aria-controls="listing-delivery-panel"
            className="form-tab"
            onClick={() => { setFormTab("delivery"); setError(null); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                setFormTab("details");
                requestAnimationFrame(() => document.getElementById("listing-details-tab")?.focus());
              }
            }}
          >
            Delivery &amp; terms
          </button>
        </div>

        <section id="listing-details-panel" role="tabpanel" aria-hidden={formTab !== "details"} hidden={formTab !== "details"} className="form-tab-panel" data-tour="listing-details">
          <Field label="Service title" required hint="What are you offering?">
            <input
              className="input"
              placeholder="Logo design, brand identity pack"
              value={title}
              maxLength={100}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>

          <Field label="Description" hint="Tell buyers what they get, your process, turnaround, etc.">
            <textarea
              className="textarea"
              placeholder="I'll design a complete brand identity including logo, color palette, and typography..."
              value={description}
              maxLength={800}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>

          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,7rem)] gap-3">
            <Field label="Price" required className="min-w-0">
              <input
                className="input tabular-nums"
                type="number"
                inputMode="decimal"
                min="0"
                max="1000000000"
                step="0.01"
                placeholder="50"
                value={priceAmount}
                onChange={(e) => setPriceAmount(e.target.value)}
              />
            </Field>
            <Field label="Currency" className="min-w-0">
              <select className="select" value={priceCurrency} onChange={(e) => setPriceCurrency(e.target.value as Currency)}>
                <option value="USDT">USDT</option>
                <option value="NIM">NIM</option>
              </select>
            </Field>
          </div>

          <div data-tour="listing-stock">
          <Field label="Quantity" required hint="Stock available for separate buyers.">
            <input
              className="input tabular-nums"
              type="number"
              inputMode="numeric"
              min="1"
              max="1000"
              step="1"
              value={quantityTotal}
              onChange={(e) => setQuantityTotal(e.target.value)}
            />
          </Field>

          <Field label="Product image" hint={`Optional JPG, PNG, or WebP up to ${LISTING_IMAGE_MAX_SOURCE_BYTES / 1024 / 1024} MB.`}>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(event) => chooseImage(event.target.files?.[0])}
            />
            {imagePreview ? (
              <div className="overflow-hidden rounded-xl border border-edge bg-bg">
                <div className="aspect-[16/9] w-full overflow-hidden">
                  <img src={imagePreview} alt="Product preview" className="h-full w-full object-cover" />
                </div>
                <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <p className="min-w-0 truncate text-[12px] text-muted">{imageFile?.name}</p>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" className="btn-secondary px-2.5 py-1.5 text-[11.5px]" onClick={() => imageInputRef.current?.click()}>
                      Change
                    </button>
                    <button
                      type="button"
                      className="btn-secondary px-2.5 py-1.5 text-[11.5px] text-danger"
                      onClick={() => setImageFile(null)}
                      aria-label="Remove product image"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-edge bg-bg px-4 py-6 text-[13px] font-medium text-muted transition hover:border-accent/50 hover:text-ink"
              >
                <ImagePlus className="h-5 w-5 text-accent" />
                Select product image
              </button>
            )}
          </Field>
          </div>

          <p className="rounded-lg border border-dashed border-edge bg-bg px-3 py-2 text-[13px] leading-relaxed text-muted">
            Buyers pay through escrow and funds stay locked until delivery is
            confirmed. T&C apply.
          </p>

          {/* Payout wallet — required whenever the listing currency doesn't
              match the login wallet. Reads the address from the currency's
              provider without touching the auth session, so linking a USDT
              wallet does NOT log the user out of their NIM identity. */}
          {session?.address &&
            (session.currency !== priceCurrency ||
              (priceCurrency === "USDT" && !inNimiqPay)) && (
            <div className="rounded-lg border border-edge bg-bg px-3 py-3 space-y-2">
              <div className="flex items-start gap-2">
                <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <div className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-muted">
                  {priceCurrency === "USDT" && !inNimiqPay ? (
                    <>
                      USDT payouts must use your{" "}
                      <span className="font-semibold text-ink">
                        Nimiq Pay Polygon wallet
                      </span>
                      . A browser extension wallet will not be selected.
                    </>
                  ) : (
                    <>
                      You're signed in with your{" "}
                      <span className="font-semibold text-ink">
                        {session.currency}
                      </span>{" "}
                      wallet, but this listing pays out in{" "}
                      <span className="font-semibold text-ink">
                        {priceCurrency}
                      </span>
                      . Link your {priceCurrency} wallet to receive payouts —
                      your XcrowHub identity stays on your {session.currency} wallet.
                    </>
                  )}
                </div>
              </div>
              {payoutAddr ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-edge bg-surface px-2.5 py-2">
                  <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink">
                    <Check className="h-3.5 w-3.5 text-accent" />
                    <span className="font-mono">{shortAddr(payoutAddr)}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setPayoutAddr("")}
                    className="text-[11.5px] text-muted transition hover:text-ink"
                  >
                    Change
                  </button>
                </div>
              ) : priceCurrency === "USDT" && !inNimiqPay ? (
                <div className="space-y-2">
                  <p className="text-[12px] leading-relaxed text-muted">
                    Your Nimiq Pay USDT address is available only inside the
                    app. Opening this screen there prevents a browser extension
                    wallet from being selected by mistake.
                  </p>
                  <a
                    href={nimiqPayDeeplink("/listings/new")}
                    onClick={openNimiqPayOrStore(
                      nimiqPayDeeplink("/listings/new")
                    )}
                    className="btn-secondary w-full text-[12.5px]"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open in Nimiq Pay
                  </a>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={linkPayoutWallet}
                  disabled={linking}
                  className="btn-secondary w-full text-[12.5px]"
                >
                  <Wallet className="h-4 w-4" />
                  {linking ? "Linking…" : `Link ${priceCurrency} payout wallet`}
                </button>
              )}
            </div>
          )}

          <Field label="Category">
            <select className="select" value={category} onChange={(e) => setCategory(e.target.value as DealCategory)}>
              {DEAL_CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </Field>

          <Field label="Tags" hint="Up to 5 tags. Press Enter to add.">
            <div className="space-y-2">
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((t) => (
                    <span key={t} className="flex items-center gap-1 rounded-md border border-accent/30 bg-accent-soft px-2.5 py-0.5 text-[12.5px] text-accent-ink">
                      #{t}
                      <button type="button" onClick={() => setTags(tags.filter((x) => x !== t))} className="text-muted hover:text-danger">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted pointer-events-none" />
                  <input
                    className="input pl-8 text-[14px]"
                    placeholder="e.g. figma, branding, logo"
                    value={tagInput}
                    maxLength={20}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                    disabled={tags.length >= 5}
                  />
                </div>
                <button type="button" onClick={addTag} disabled={!tagInput.trim() || tags.length >= 5} className="btn-secondary px-3">
                  Add
                </button>
              </div>
            </div>
          </Field>
        </section>

        <section id="listing-delivery-panel" role="tabpanel" aria-hidden={formTab !== "delivery"} hidden={formTab !== "delivery"} className="form-tab-panel">
          <Field label="What counts as delivery?" required hint="Buyers will check this.">
            <textarea
              className="textarea"
              placeholder="Figma source file + exported PNG/SVG/PDF files"
              value={requiredDeliveryProof}
              maxLength={400}
              onChange={(e) => setRequiredDeliveryProof(e.target.value)}
            />
          </Field>

          <Field label="Refund terms" required hint="When can buyers request a refund?">
            <textarea
              className="textarea"
              placeholder="Full refund if not delivered within the deadline."
              value={refundTerms}
              maxLength={400}
              onChange={(e) => setRefundTerms(e.target.value)}
            />
          </Field>

          <div className="grid min-w-0 grid-cols-2 gap-3">
            <Field label="Delivery deadline (hrs)" required className="min-w-0">
              <input className="input tabular-nums" type="number" min="1" max="8760" value={deliveryHours} onChange={(e) => setDeliveryHours(e.target.value)} />
            </Field>
            <Field label="Confirmation window (hrs)" required className="min-w-0">
              <input className="input tabular-nums" type="number" min="1" max="8760" value={confirmationHours} onChange={(e) => setConfirmationHours(e.target.value)} />
            </Field>
          </div>
        </section>

        <ConsentCheck checked={agreed} onChange={setAgreed} />

        {error && <p className="text-sm text-danger">{error}</p>}

        <button type="submit" className="btn-primary w-full" disabled={submitting || authLoading || !agreed} data-tour="listing-submit">
          {submitting && <SkeletonDots label="Publishing listing" />}
          {submitting ? "Publishing..." : "Publish listing"}
        </button>
      </form>

      {/* Publish confirm — quick summary of what's about to go live. Kept
          intentionally short (title + price + payout wallet); the terms are
          already in-form and reviewed above. */}
      <AlertDialog
        open={confirmingPublish}
        onOpenChange={(open) => {
          if (!open && submitting) return;
          setConfirmingPublish(open);
        }}
        title="Publish this listing?"
        description={`"${title.trim() || "Untitled"}" will go live at ${priceAmount || "0"} ${priceCurrency}. Buyers can pay into escrow immediately. Payouts land on ${payoutAddr ? `${payoutAddr.slice(0, 6)}…${payoutAddr.slice(-4)}` : "your wallet"}.`}
        cancelLabel="Review again"
        actionLabel={submitting ? "Publishing…" : "Publish listing"}
        onAction={doPublish}
        busy={submitting}
      />
    </div>
  );
}
