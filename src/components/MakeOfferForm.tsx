import { useState } from "react";
import { Tag, X, Loader2 } from "lucide-react";
import type { Currency } from "@/types/deal";

const MAX_AMOUNT = 1e9;

export function MakeOfferForm({
  listPrice,
  currency,
  submitting,
  error,
  onSubmit,
  onCancel,
}: {
  listPrice: string;
  currency: Currency;
  submitting: boolean;
  error: string | null;
  onSubmit: (amount: string, message: string) => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState(listPrice);
  const [message, setMessage] = useState("");

  const numeric = Number(amount);
  const valid = Number.isFinite(numeric) && numeric > 0 && numeric <= MAX_AMOUNT;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || submitting) return;
    onSubmit(String(numeric), message.trim().slice(0, 500));
  }

  return (
    <form onSubmit={handleSubmit} className="card px-5 py-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-[14px] font-semibold text-ink">
          <Tag className="h-4 w-4 text-accent" />
          Make an offer
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="text-muted hover:text-ink transition"
          title="Cancel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-1.5">
        <label className="field-label">Your price ({currency})</label>
        <div className="relative">
          <input
            autoFocus
            inputMode="decimal"
            className="input text-[15px] pr-14"
            value={amount}
            maxLength={16}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, "").slice(0, 16))}
            placeholder={listPrice}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12.5px] font-medium text-muted">
            {currency}
          </span>
        </div>
        <p className="text-[12px] text-muted">
          List price is {listPrice} {currency}. The seller can accept, decline, or counter.
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="field-label">Message to seller (optional)</label>
        <textarea
          className="input min-h-[64px] resize-none text-[13.5px]"
          maxLength={500}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Add context for your offer…"
        />
      </div>

      {error && <p className="text-[12.5px] text-danger">{error}</p>}

      <button type="submit" disabled={!valid || submitting} className="btn-primary w-full">
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tag className="h-4 w-4" />}
        {submitting ? "Sending offer…" : "Send offer"}
      </button>
    </form>
  );
}
