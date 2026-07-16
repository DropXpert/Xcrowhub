import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Loader2, RotateCcw } from "lucide-react";
import { QrScanner } from "@/components/QrScanner";
import { dealPayPath, extractDealId } from "@/lib/dealLinks";

export default function ScanDeal() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const closeScanner = useCallback(() => {
    navigate("/", { replace: true });
  }, [navigate]);

  const handleScan = useCallback(
    (text: string) => {
      const dealId = extractDealId(text);
      if (!dealId) {
        setError("That QR is not a XcrowHub deal. Try again or enter the ID manually.");
        return;
      }

      setError(null);
      setOpeningId(dealId);
      navigate(dealPayPath(dealId), { replace: true });
    },
    [navigate]
  );

  if (openingId) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-ink/95 px-6 text-center text-white">
        <div className="flex max-w-xs flex-col items-center gap-4">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-white/10 text-white">
            <Loader2 className="h-5 w-5 animate-spin" />
          </span>
          <div className="space-y-1">
            <h1 className="text-[17px] font-semibold">Opening payment</h1>
            <p className="text-[13px] leading-relaxed text-white/70">
              Loading deal {openingId}.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-ink/95 px-6 py-5 text-white">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={closeScanner}
            className="grid h-9 w-9 place-items-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white"
            aria-label="Close scanner"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-danger/20 text-danger">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="mt-4 max-w-xs space-y-2">
            <h1 className="text-[17px] font-semibold">QR not recognized</h1>
            <p className="text-[13px] leading-relaxed text-white/70">{error}</p>
          </div>

          <div className="mt-7 flex w-full max-w-xs flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setAttempt((value) => value + 1);
              }}
              className="btn-primary w-full"
            >
              <RotateCcw className="h-4 w-4" />
              Scan again
            </button>
            <button
              type="button"
              onClick={() => navigate("/find", { replace: true })}
              className="btn-secondary w-full"
            >
              Enter deal ID
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <QrScanner key={attempt} onResult={handleScan} onClose={closeScanner} />;
}
