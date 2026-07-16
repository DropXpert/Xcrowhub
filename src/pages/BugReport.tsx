import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertCircle, Bug, CheckCircle2, Loader2, Send } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { getSupabaseClient, isSupabaseConfiguredForClient } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";

type SubmitState = "idle" | "sent";

interface BugReportPayload {
  summary: string;
  description: string;
  contact: string;
  sourcePath: string;
  walletAddress: string;
  userAgent: string;
  createdAt: string;
}

function clean(value: string, max: number) {
  return value.trim().slice(0, max);
}

export default function BugReport() {
  const [searchParams] = useSearchParams();
  const session = useAuthStore((s) => s.session);
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [contact, setContact] = useState("");
  const [company, setCompany] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<SubmitState>("idle");
  const [error, setError] = useState<string | null>(null);
  const submitLock = useRef(false);
  const sourcePath = searchParams.get("from") || "/";

  const userAgent = useMemo(
    () => (typeof navigator === "undefined" ? "Unknown" : navigator.userAgent),
    []
  );

  function makePayload(): BugReportPayload {
    const fallbackSummary = clean(description.split("\n")[0] ?? "", 90);
    return {
      summary: clean(summary, 120) || fallbackSummary || "New report",
      description: clean(description, 4000),
      contact: clean(contact, 180),
      sourcePath: clean(sourcePath, 300),
      walletAddress: session?.address ?? "",
      userAgent: clean(userAgent, 500),
      createdAt: new Date().toISOString(),
    };
  }

  function resetForm() {
    setSummary("");
    setDescription("");
    setContact("");
    setCompany("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitLock.current || submitting) return;
    setError(null);

    if (company.trim()) {
      setStatus("sent");
      resetForm();
      return;
    }

    if (!description.trim()) {
      setError("Describe the bug first.");
      return;
    }

    const payload = makePayload();
    submitLock.current = true;
    setSubmitting(true);
    try {
      if (!isSupabaseConfiguredForClient()) {
        throw new Error("Email endpoint is not configured.");
      }

      const { error: fnError } = await getSupabaseClient().functions.invoke("bug-report", {
        body: payload,
      });

      if (fnError) throw fnError;
      setStatus("sent");
      resetForm();
    } catch {
      setError("Could not send the report right now. Please try again in a minute.");
    } finally {
      setSubmitting(false);
      submitLock.current = false;
    }
  }

  if (status === "sent") {
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="Beta" title="Report bug" />
        <div className="card px-5 py-8 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-accent-soft">
            <CheckCircle2 className="h-6 w-6 text-accent" />
          </span>
          <h2 className="mt-4 text-[17px] font-semibold text-ink">Thank you</h2>
          <p className="mx-auto mt-2 max-w-[260px] text-[13px] leading-relaxed text-muted">
            Your bug report has been sent.
          </p>
          <button
            type="button"
            className="btn-secondary mt-6 w-full"
            onClick={() => setStatus("idle")}
          >
            Report another bug
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Beta" title="Report bug" />

      <form onSubmit={handleSubmit} className="card px-5 py-5 space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-warning/25 bg-warning/10 px-3.5 py-3">
          <Bug className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p className="text-[13px] leading-relaxed text-muted">
            Reports go directly to the XcrowHub beta team.
          </p>
        </div>

        <input
          className="hidden"
          tabIndex={-1}
          autoComplete="off"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        />

        <div className="space-y-1.5">
          <label className="field-label">Bug summary</label>
          <input
            className="input text-[14px]"
            placeholder="e.g. Payment screen got stuck"
            value={summary}
            maxLength={120}
            onChange={(e) => setSummary(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="field-label">Describe the bug</label>
          <textarea
            className="textarea text-[14px]"
            rows={6}
            placeholder="What went wrong? Add the screen, steps to reproduce, and what you expected to happen."
            value={description}
            maxLength={4000}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="field-label">Contact optional</label>
          <input
            className="input text-[14px]"
            placeholder="Telegram, email, or Nimiq address"
            value={contact}
            maxLength={180}
            onChange={(e) => setContact(e.target.value)}
          />
        </div>

        <div className="rounded-lg border border-edge bg-bg px-3.5 py-3">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-muted">Context</p>
          <p className="mt-1 truncate font-mono text-[12px] text-muted">{sourcePath}</p>
          {session?.address ? (
            <p className="mt-1 truncate font-mono text-[12px] text-muted">{session.address}</p>
          ) : null}
        </div>

        {error ? (
          <div className="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2.5 text-[12.5px] text-danger">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {submitting ? "Sending..." : "Send report"}
        </button>
      </form>
    </div>
  );
}
