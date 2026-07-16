import { useState } from "react";
import { Paperclip, X } from "lucide-react";
import { Field } from "./Field";

export interface ProofDraft {
  explanation: string;
  txHash: string;
  attachments: string[];
}

interface ProofUploadProps {
  role: "buyer" | "seller";
  value: ProofDraft;
  onChange: (next: ProofDraft) => void;
}

export function ProofUpload({ role, value, onChange }: ProofUploadProps) {
  const [draft, setDraft] = useState("");
  const isBuyer = role === "buyer";

  const checklist = isBuyer
    ? [
        "Short explanation of the issue",
        "Payment transaction hash (or screenshot)",
        "Optional: screenshot of broken link / missing access / chat",
      ]
    : [
        "Short explanation of what was delivered",
        "Delivery proof (link, file, or screenshot)",
        "Optional: chat or timestamp showing delivery",
      ];

  function addAttachment() {
    const cleaned = draft.trim();
    if (!cleaned) return;
    onChange({ ...value, attachments: [...value.attachments, cleaned] });
    setDraft("");
  }

  function removeAttachment(idx: number) {
    onChange({
      ...value,
      attachments: value.attachments.filter((_, i) => i !== idx),
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-edge bg-bg p-3">
        <p className="field-label">Proof checklist</p>
        <ul className="mt-2 space-y-1.5 text-[13px] text-ink">
          {checklist.map((item) => (
            <li key={item} className="flex items-start gap-2">
              <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-muted" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <Field
        label="Short explanation"
        required
        hint="Plain language. What happened, in 1 to 3 sentences."
      >
        <textarea
          className="textarea"
          value={value.explanation}
          maxLength={800}
          onChange={(e) =>
            onChange({ ...value, explanation: e.target.value })
          }
          placeholder={
            isBuyer
              ? "The link you sent doesn't open. I see access denied."
              : "Sent the Figma link and final files at 14:02. Access settings are public."
          }
        />
      </Field>

      <Field
        label={isBuyer ? "Payment transaction hash" : "Delivery reference"}
        hint={
          isBuyer
            ? "Your payment tx hash, or a link to a screenshot of payment."
            : "Link, file URL, or short reference to where delivery happened."
        }
      >
        <input
          className="input font-mono text-[13px]"
          value={value.txHash}
          maxLength={500}
          onChange={(e) => onChange({ ...value, txHash: e.target.value })}
          placeholder={isBuyer ? "0x…" : "https://figma.com/file/…"}
        />
      </Field>

      <Field
        label="Attachments"
        hint="Paste a link to a screenshot, file, or chat. Add as many as you need."
      >
        <div className="flex gap-2">
          <input
            className="input"
            value={draft}
            maxLength={2048}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addAttachment();
              }
            }}
            placeholder="https://…"
          />
          <button
            type="button"
            className="btn-secondary"
            onClick={addAttachment}
            disabled={!draft.trim()}
          >
            <Paperclip className="h-4 w-4" />
            Add
          </button>
        </div>

        {value.attachments.length > 0 ? (
          <ul className="mt-2 space-y-1.5">
            {value.attachments.map((url, idx) => (
              <li
                key={`${url}-${idx}`}
                className="flex items-center justify-between gap-2 rounded-md border border-edge bg-bg px-2.5 py-1.5"
              >
                <span className="truncate text-[13px] font-mono text-ink">
                  {url}
                </span>
                <button
                  type="button"
                  onClick={() => removeAttachment(idx)}
                  className="text-muted hover:text-danger"
                  aria-label="Remove attachment"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </Field>
    </div>
  );
}
