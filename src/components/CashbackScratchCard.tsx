import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Gift, RefreshCw, Sparkles } from "lucide-react";
import { useCashbackStore } from "@/store/cashbackStore";
import { RewardFireworks } from "@/components/RewardFireworks";
import { TxHashLink } from "@/components/TxHashLink";

const SCRATCH_THRESHOLD = 0.52;

export function CashbackScratchCard({
  dealId,
  previewRewardNim,
}: {
  dealId: string;
  previewRewardNim?: number;
}) {
  const isPreview = typeof previewRewardNim === "number";
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scratchingRef = useRef(false);
  const moveCountRef = useRef(0);
  const revealLockRef = useRef(false);
  const liveStatus = useCashbackStore((state) => state.byDeal[dealId]);
  const liveLoading = useCashbackStore((state) => state.loadingByDeal[dealId] === true);
  const loadDeal = useCashbackStore((state) => state.loadDeal);
  const revealDeal = useCashbackStore((state) => state.revealDeal);
  const retryPayout = useCashbackStore((state) => state.retryPayout);
  const [celebrating, setCelebrating] = useState(false);
  const [scratchStarted, setScratchStarted] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);
  const [previewRevealed, setPreviewRevealed] = useState(false);
  const status = isPreview
    ? {
        eligible: true,
        revealed: previewRevealed,
        reason: null,
        reward: previewRevealed
          ? {
              id: "admin-preview",
              dealId,
              amountNim: previewRewardNim,
              revealedAt: new Date().toISOString(),
              payoutStatus: "not_applicable" as const,
              payoutTxHash: null,
              paidAt: null,
            }
          : null,
      }
    : liveStatus;
  const loading = isPreview ? false : liveLoading;

  useEffect(() => {
    if (isPreview) return;
    void loadDeal(dealId);
  }, [dealId, isPreview, loadDeal]);

  const paintScratchLayer = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const gradient = ctx.createLinearGradient(0, 0, rect.width, rect.height);
    gradient.addColorStop(0, "#f1cb76");
    gradient.addColorStop(0.48, "#c99b43");
    gradient.addColorStop(1, "#8c6628");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, rect.width, rect.height);

    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#fff9df";
    for (let x = -rect.height; x < rect.width + rect.height; x += 22) {
      ctx.save();
      ctx.translate(x, 0);
      ctx.rotate(-0.45);
      ctx.fillRect(0, 0, 2, rect.height * 1.8);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#2b2113";
    ctx.textAlign = "center";
    ctx.font = "700 14px Inter, system-ui, sans-serif";
    ctx.fillText("SCRATCH TO REVEAL", rect.width / 2, rect.height / 2 - 2);
    ctx.font = "500 11px Inter, system-ui, sans-serif";
    ctx.fillStyle = "rgba(43,33,19,.72)";
    ctx.fillText("your NIM cashback", rect.width / 2, rect.height / 2 + 20);
  }, []);

  useEffect(() => {
    if (!status?.eligible || status.reward) return;
    paintScratchLayer();
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(paintScratchLayer);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [paintScratchLayer, status?.eligible, status?.reward]);

  useEffect(() => {
    if (!celebrating) return;
    const timer = window.setTimeout(() => setCelebrating(false), 2600);
    return () => window.clearTimeout(timer);
  }, [celebrating]);

  const reveal = useCallback(async () => {
    if (revealLockRef.current || status?.reward) return;
    if (isPreview) {
      setPreviewRevealed(true);
      if ((previewRewardNim ?? 0) > 0) setCelebrating(true);
      return;
    }
    revealLockRef.current = true;
    setRevealError(null);
    const result = await revealDeal(dealId);
    revealLockRef.current = false;
    if (!result) {
      setRevealError("Could not reveal your reward. Please try again.");
      paintScratchLayer();
      setScratchStarted(false);
      return;
    }
    if (result.newlyRevealed && result.reward.amountNim > 0) {
      setCelebrating(true);
    }
  }, [dealId, isPreview, paintScratchLayer, previewRewardNim, revealDeal, status?.reward]);

  function scratchAt(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || revealLockRef.current) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(x, y, Math.max(21, rect.width * 0.065), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    moveCountRef.current += 1;
    if (moveCountRef.current % 5 !== 0) return;
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let transparent = 0;
    let sampled = 0;
    const step = 4 * 18;
    for (let index = 3; index < pixels.length; index += step) {
      sampled += 1;
      if (pixels[index] < 40) transparent += 1;
    }
    if (sampled && transparent / sampled >= SCRATCH_THRESHOLD) void reveal();
  }

  if (!status && !loading) return null;
  if (status && !status.eligible) return null;

  const reward = status?.reward;

  return (
    <>
      <RewardFireworks active={celebrating} />
      <section className="cashback-card" aria-live="polite">
        <div className="cashback-card-glow" aria-hidden="true" />
        <div className="relative z-10 flex items-center justify-between gap-3 px-4 pt-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/10 text-[#f3c969]">
              <Gift className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#91d9bd]">
                {isPreview ? "Admin preview" : "XcrowHub reward"}
              </p>
              <h3 className="mt-0.5 text-[16px] font-bold tracking-tight text-white">
                Deal completed
              </h3>
            </div>
          </div>
          <Sparkles className="h-5 w-5 shrink-0 text-[#f3c969]" />
        </div>

        <div className="relative z-10 px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
          <div className="cashback-scratch-stage">
            <div className="cashback-reward-result">
              {reward ? (
                reward.amountNim > 0 ? (
                  <>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.17em] text-[#91d9bd]">
                      You received
                    </p>
                    <p className="mt-1 text-[34px] font-black leading-none tracking-tight text-white tabular-nums">
                      {reward.amountNim.toLocaleString()} <span className="text-[18px] text-[#f3c969]">NIM</span>
                    </p>
                    <p className="mt-2 text-[11.5px] text-white/65">
                      {isPreview
                        ? "Preview only — no wallet transfer"
                        : reward.payoutStatus === "paid"
                          ? "Sent to your Nimiq wallet"
                          : "Sending to your Nimiq wallet"}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-[17px] font-bold text-white">No cashback this time</p>
                    <p className="mt-1 text-[11.5px] text-white/60">Complete another eligible purchase for a new card.</p>
                  </>
                )
              ) : (
                <>
                  <Sparkles className="mx-auto h-6 w-6 text-[#f3c969]" />
                  <p className="mt-2 text-[14px] font-semibold text-white">Your reward is underneath</p>
                  <p className="mt-1 text-[11.5px] text-white/55">Scratch the gold layer</p>
                </>
              )}
            </div>

            {!reward && (
              <canvas
                ref={canvasRef}
                className={`cashback-scratch-canvas ${loading ? "pointer-events-none opacity-70" : ""}`}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  scratchingRef.current = true;
                  setScratchStarted(true);
                  scratchAt(event);
                }}
                onPointerMove={(event) => {
                  if (scratchingRef.current) scratchAt(event);
                }}
                onPointerUp={(event) => {
                  scratchingRef.current = false;
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }}
                onPointerCancel={() => {
                  scratchingRef.current = false;
                }}
                aria-label="Scratch to reveal NIM cashback"
              />
            )}
          </div>

          {!reward && (
            <button
              type="button"
              disabled={loading}
              onClick={() => void reveal()}
              className="mt-3 w-full text-center text-[11.5px] font-semibold text-white/65 underline decoration-white/25 underline-offset-4 transition hover:text-white disabled:opacity-50"
            >
              {loading ? "Revealing reward..." : scratchStarted ? "Keep scratching or tap to reveal" : "Tap to reveal instead"}
            </button>
          )}

          {reward?.amountNim ? (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {isPreview ? (
                <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[#91d9bd]">
                  <Sparkles className="h-3.5 w-3.5" />
                  Preview card — no payout created
                </span>
              ) : reward.payoutStatus === "paid" ? (
                <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[#91d9bd]">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Cashback paid
                </span>
              ) : (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void retryPayout(reward.id, dealId)}
                  className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[#f3c969] disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                  Retry payout
                </button>
              )}
              {reward.payoutTxHash ? <TxHashLink hash={reward.payoutTxHash} label="reward tx" /> : null}
            </div>
          ) : null}

          {revealError ? (
            <p className="mt-2 text-center text-[11.5px] text-[#ff9d9b]">{revealError}</p>
          ) : null}
        </div>
      </section>
    </>
  );
}
