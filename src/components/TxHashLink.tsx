import { useState } from "react";
import { Hash, Copy, Check } from "lucide-react";

export function TxHashLink({ hash, label }: { hash: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const short = `${hash.slice(0, 6)}…${hash.slice(-4)}`;

  const copyToClipboard = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (err) {
      // Fallback for environments where clipboard API fails (e.g. some embedded browsers in Nimiq Pay, iframes, or mobile webviews)
      console.error("Clipboard copy failed, using fallback:", err);
      window.prompt("Copy transaction hash:", hash);
    }
  };

  return (
    <button
      type="button"
      onClick={copyToClipboard}
      title={`Click to copy full hash: ${hash}`}
      className="inline-flex items-center gap-1.5 rounded-md border border-edge bg-bg px-2 py-0.5 font-mono text-[12.5px] text-ink hover:bg-surface active:scale-[0.985] transition"
    >
      <Hash className="h-3 w-3 text-muted" />
      {label ? <span className="font-sans text-muted">{label}</span> : null}
      <span className="select-all">{short}</span>
      {copied ? (
        <Check className="h-3 w-3 text-accent" />
      ) : (
        <Copy className="h-3 w-3 text-muted" />
      )}
    </button>
  );
}
