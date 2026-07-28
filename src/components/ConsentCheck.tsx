import { Link } from "react-router-dom";
import { Checkbox } from "@/components/ui/checkbox";

/**
 * Escrow-consent acknowledgement shown above the submit button on the create
 * flows. The whole line is tappable; the Terms link navigates without toggling.
 */
export function ConsentCheck({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <Checkbox
        checked={checked}
        onCheckedChange={(c) => onChange(c === true)}
        aria-label="I understand and agree to the escrow terms"
        className="mt-0.5"
      />
      <span
        onClick={() => onChange(!checked)}
        className="cursor-pointer select-none text-[13px] leading-relaxed text-muted"
      >
        I understand funds stay in on-chain escrow until the buyer confirms
        delivery, and I agree to the{" "}
        <Link
          to="/terms"
          onClick={(e) => e.stopPropagation()}
          className="text-accent underline-offset-2 hover:underline"
        >
          Terms
        </Link>
        .
      </span>
    </div>
  );
}
