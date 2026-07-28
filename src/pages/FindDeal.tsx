import { useEffect, useState } from "react";
import { Search, QrCode } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Field } from "@/components/Field";
import { PageLoader } from "@/components/PageLoader";
import { dealStatusPath, extractDealId } from "@/lib/dealLinks";

export default function FindDeal() {
  const [searchParams] = useSearchParams();
  const [id, setId] = useState("");
  const shouldOpenScanner = searchParams.get("scan") === "1";
  const [scanError, setScanError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (shouldOpenScanner) navigate("/scan", { replace: true });
  }, [shouldOpenScanner, navigate]);

  function openScanner() {
    if (typeof document !== "undefined") {
      (document.activeElement as HTMLElement | null)?.blur();
    }
    setScanError(null);
    navigate("/scan");
  }

  function open(e: React.FormEvent) {
    e.preventDefault();
    const dealId = extractDealId(id);
    if (!dealId) {
      setScanError("Enter a valid XcrowHub deal ID or link.");
      return;
    }
    setScanError(null);
    navigate(dealStatusPath(dealId));
  }

  if (shouldOpenScanner) {
    return <PageLoader title="Opening scanner" detail="Starting camera." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Open deal" title="Find an existing deal" />

      <form onSubmit={open} className="card space-y-4 px-5 py-5">
        <Field
          label="Deal ID"
          hint="Looks like PH-XXXX-XXXX. Paste a link or just the ID."
          required
        >
          <input
            className="input font-mono"
            placeholder="PH-XXXX-XXXX"
            value={id}
            maxLength={64}
            onChange={(e) => setId(e.target.value.toUpperCase())}
          />
        </Field>
        <button type="submit" className="btn-primary w-full">
          <Search className="h-4 w-4" />
          Open deal
        </button>
        <button
          type="button"
          onClick={openScanner}
          className="btn-secondary w-full"
        >
          <QrCode className="h-4 w-4" />
          Scan to pay
        </button>
        {scanError ? (
          <p className="text-[13px] text-danger" role="alert">
            {scanError}
          </p>
        ) : null}
      </form>

    </div>
  );
}
