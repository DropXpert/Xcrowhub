import { useEffect, useRef, useState } from "react";
import { X, Camera, Loader2 } from "lucide-react";

/**
 * Full-screen camera QR scanner. Opens the rear camera, decodes a QR, and
 * hands the raw text back via `onResult`. html5-qrcode is imported lazily so
 * its decoder (~300KB) never lands in the main bundle — only when the buyer
 * actually taps "Scan".
 */
export function QrScanner({
  onResult,
  onClose,
}: {
  onResult: (text: string) => void;
  onClose: () => void;
}) {
  const regionRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"starting" | "scanning" | "opening" | "error">(
    "starting"
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let scanner: import("html5-qrcode").Html5Qrcode | null = null;
    let stopped = false;
    const elementId = "qr-scan-region";

    async function stopScanner() {
      const current = scanner;
      if (!current) return;

      await Promise.resolve(current.stop()).catch(() => {});
      try {
        current.clear?.();
      } catch {
        // Clear can throw if html5-qrcode is already torn down.
      }
    }

    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (stopped || !regionRef.current) return;
        regionRef.current.id = elementId;
        scanner = new Html5Qrcode(elementId, { verbose: false });
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decodedText) => {
            if (stopped) return;
            stopped = true;
            setStatus("opening");
            // Stop the camera before handing control back so the stream is
            // released even though the parent unmounts us.
            stopScanner().finally(() => onResult(decodedText));
          },
          () => {
            // Per-frame decode miss — ignored; this fires constantly.
          }
        );
        if (!stopped) setStatus("scanning");
      } catch (err) {
        if (stopped) return;
        console.error("[XcrowHub] QR scanner failed:", err);
        setErrorMsg(
          "Couldn't open the camera. Allow camera access and try again."
        );
        setStatus("error");
      }
    })();

    return () => {
      stopped = true;
      stopScanner();
    };
  }, [onResult]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink/95">
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2 text-white">
          <Camera className="h-4 w-4" />
          <span className="text-[14px] font-semibold">Scan to pay</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close scanner"
          className="grid h-9 w-9 place-items-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="relative w-full max-w-[300px] overflow-hidden rounded-2xl bg-black">
          <div ref={regionRef} className="aspect-square w-full" />
          {status !== "scanning" && (
            <div className="absolute inset-0 grid place-items-center text-center text-[13px] text-white/80">
              {status === "starting" ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Starting camera…
                </span>
              ) : status === "opening" ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Opening payment...
                </span>
              ) : (
                <span className="px-6">{errorMsg}</span>
              )}
            </div>
          )}
        </div>
        <p className="mt-5 text-center text-[13px] text-white/70">
          Point your camera at a XcrowHub deal QR to open and pay it.
        </p>
      </div>
    </div>
  );
}
