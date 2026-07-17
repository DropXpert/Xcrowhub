import { useState, useEffect, useRef } from "react";
import { Send, Inbox, CheckCircle2, Clock, ChevronRight, ArrowLeft, RotateCcw } from "lucide-react";
import { useSupportStore } from "@/store/supportStore";
import type { SupportTicket } from "@/store/supportStore";
import { PageHeader } from "@/components/PageHeader";
import { ChatSkeleton, ListSkeleton, SkeletonDots } from "@/components/LoadingStates";

function TicketStatusPill({ status }: { status: "open" | "resolved" }) {
  return status === "resolved" ? (
    <span className="pill border-accent/30 bg-accent-soft text-accent-ink text-[12px]">Resolved</span>
  ) : (
    <span className="pill border-warning/40 bg-warning/10 text-warning text-[12px]">Open</span>
  );
}

function AdminChatOverlay({
  ticket: initialTicket,
  onClose,
  onTicketUpdate,
}: {
  ticket: SupportTicket;
  onClose: () => void;
  onTicketUpdate: (t: SupportTicket) => void;
}) {
  const [ticket, setTicket] = useState(initialTicket);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sendLock = useRef(false);
  const statusLock = useRef(false);

  const { loadThread, sendMessage, subscribeThread, resolveTicket, reopenTicket, threads } = useSupportStore();
  const msgs = threads[ticket.id]?.messages ?? [];
  const isResolved = ticket.status === "resolved";

  useEffect(() => {
    loadThread(ticket.id, ticket.dealId);
    const unsub = subscribeThread(ticket.id, ticket.dealId, () => {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    });
    return unsub;
  }, [ticket.id, ticket.dealId, loadThread, subscribeThread]);

  useEffect(() => {
    if (msgs.length) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (sendLock.current || sending) return;
    if (!draft.trim() || isResolved) return;
    sendLock.current = true;
    setSending(true);
    setError(null);
    try {
      await sendMessage(ticket.id, ticket.dealId, draft.trim(), "admin", "admin");
      setDraft("");
      inputRef.current?.focus();
    } catch (err: any) {
      setError(err.message ?? "Failed to send.");
    } finally {
      setSending(false);
      sendLock.current = false;
    }
  }

  async function handleResolve() {
    if (statusLock.current || resolving) return;
    statusLock.current = true;
    setResolving(true);
    try {
      await resolveTicket(ticket.id, "admin");
      const updated = { ...ticket, status: "resolved" as const };
      setTicket(updated);
      onTicketUpdate(updated);
    } catch (err: any) {
      setError(err?.message ?? "Failed to resolve ticket.");
    } finally {
      setResolving(false);
      statusLock.current = false;
    }
  }

  async function handleReopen() {
    if (statusLock.current) return;
    statusLock.current = true;
    try {
      await reopenTicket(ticket.id);
      const updated = { ...ticket, status: "open" as const };
      setTicket(updated);
      onTicketUpdate(updated);
    } catch (err: any) {
      setError(err?.message ?? "Failed to reopen ticket.");
    } finally {
      statusLock.current = false;
    }
  }

  return (
    // z-[60] above BottomNav; inner wrapper max-w-app so the chat aligns
    // with the mini-app frame on wide viewports instead of edge-to-edge.
    <div className="fixed inset-0 z-[60] flex flex-col bg-bg">
      <div className="mx-auto flex w-full max-w-app flex-1 min-h-0 flex-col">
      {/* Header */}
      <div className="safe-top flex shrink-0 items-center gap-3 border-b border-edge bg-surface px-4 py-3">
        <button type="button" onClick={onClose} className="text-muted hover:text-ink transition">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-ink truncate">
            {ticket.subject || ticket.dealId}
          </p>
          <p className="font-mono text-[12px] text-muted">{ticket.dealId}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <TicketStatusPill status={ticket.status} />
          {!isResolved ? (
            <button
              type="button"
              onClick={handleResolve}
              disabled={resolving}
              className="flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent-soft px-2.5 py-1.5 text-[12.5px] font-medium text-accent-ink hover:bg-accent/10 transition"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Resolve
            </button>
          ) : (
            <button
              type="button"
              onClick={handleReopen}
              className="flex items-center gap-1.5 rounded-lg border border-edge px-2.5 py-1.5 text-[12.5px] font-medium text-muted hover:text-ink transition"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reopen
            </button>
          )}
        </div>
      </div>

      {/* Messages — min-h-0 lets flex-1 actually shrink on short viewports. */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
        {threads[ticket.id]?.loading && <ChatSkeleton />}
        {msgs.map((msg) => {
          const isAdmin = msg.sender === "admin";
          return (
            <div key={msg.id} className={`flex ${isAdmin ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 ${
                isAdmin
                  ? "rounded-br-sm bg-accent text-white"
                  : "rounded-bl-sm bg-surface border border-edge text-ink"
              }`}>
                {!isAdmin && (
                  <p className="text-[11px] font-semibold uppercase tracking-wider opacity-60 mb-1">
                    User
                    {msg.senderAddr && msg.senderAddr !== "admin" && (
                      <span className="ml-1 font-mono normal-case opacity-70">
                        {msg.senderAddr.slice(0, 10)}...
                      </span>
                    )}
                  </p>
                )}
                <p className="text-[14px] leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{msg.body}</p>
                <p className={`text-[11px] mt-0.5 ${isAdmin ? "text-white/60" : "text-muted"}`}>
                  {new Date(msg.createdAt).toLocaleString(undefined, {
                    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          );
        })}
        {isResolved && (
          <div className="flex justify-center py-2">
            <span className="flex items-center gap-1.5 rounded-md border border-accent/30 bg-accent-soft px-2.5 py-1 text-[12px] text-accent-ink">
              <CheckCircle2 className="h-3 w-3" />
              Marked as resolved
            </span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar — real safe-area padding so the field never sits under
          the iOS home indicator or the parent app's gesture bar. */}
      <div className="safe-bottom shrink-0 border-t border-edge bg-surface px-4 pt-3">
        {isResolved ? (
          <div className="flex items-center justify-center gap-2 py-1 text-[13px] text-muted">
            <span>Ticket resolved.</span>
            <button type="button" className="text-accent hover:underline font-medium" onClick={handleReopen}>
              Reopen to reply
            </button>
          </div>
        ) : (
          <form onSubmit={handleSend} className="flex gap-2">
            <input
              ref={inputRef}
              className="input flex-1 text-[14px] py-2.5"
              placeholder="Reply as admin..."
              value={draft}
              maxLength={1000}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(e as any); }
              }}
              disabled={sending}
              autoFocus
            />
            <button type="submit" className="btn-primary px-3 py-2.5" disabled={!draft.trim() || sending}>
              {sending ? <SkeletonDots label="Sending support message" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
        )}
        {error && <p className="text-[12.5px] text-danger mt-1">{error}</p>}
      </div>
      </div>
    </div>
  );
}

export default function AdminSupport() {
  const [allTickets, setAllTickets] = useState<SupportTicket[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [activeTicket, setActiveTicket] = useState<SupportTicket | null>(null);
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("open");

  const { loadAllTickets } = useSupportStore();

  useEffect(() => { fetchTickets(); }, []);

  async function fetchTickets() {
    setLoadingList(true);
    setListError(null);
    try {
      const data = await loadAllTickets();
      setAllTickets(data);
    } catch (err: any) {
      setListError(err?.message ?? "Failed to load support tickets.");
    } finally {
      setLoadingList(false);
    }
  }

  function handleTicketUpdate(updated: SupportTicket) {
    setAllTickets((prev) => prev.map((t) => t.id === updated.id ? updated : t));
  }

  const filtered = allTickets.filter((t) =>
    filter === "all" ? true : t.status === filter
  );

  if (activeTicket) {
    return (
      <AdminChatOverlay
        ticket={activeTicket}
        onClose={() => { setActiveTicket(null); fetchTickets(); }}
        onTicketUpdate={handleTicketUpdate}
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Admin" title="Support inbox" back={false} />
      {listError && <p className="text-[13px] text-danger">{listError}</p>}

      <div className="flex gap-1 rounded-xl border border-edge bg-bg p-1">
        {(["open", "resolved", "all"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`flex-1 rounded-lg py-1.5 text-[12.5px] font-medium capitalize transition ${
              filter === f ? "bg-surface shadow-sm text-ink" : "text-muted hover:text-ink"
            }`}
          >
            {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            {f !== "all" && (
              <span className="ml-1 text-[11px] opacity-60">
                ({allTickets.filter((t) => t.status === f).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {loadingList ? (
        <ListSkeleton rows={4} />
      ) : filtered.length === 0 ? (
        <div className="card px-5 py-10 flex flex-col items-center gap-3 text-center">
          <Inbox className="h-7 w-7 text-muted/50" />
          <p className="text-[14px] font-medium text-ink">
            {filter === "open" ? "No open tickets" : filter === "resolved" ? "No resolved tickets" : "No tickets yet"}
          </p>
          <p className="text-[12.5px] text-muted">
            {filter === "open" ? "All caught up!" : "Tickets will appear here when users open them."}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => setActiveTicket(t)}
                className="card w-full text-left px-4 py-3.5 hover:shadow-lift transition flex items-center gap-3"
              >
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
                  t.status === "open" ? "bg-warning/10" : "bg-accent-soft"
                }`}>
                  {t.status === "open"
                    ? <Clock className="h-4 w-4 text-warning" />
                    : <CheckCircle2 className="h-4 w-4 text-accent" />}
                </span>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] font-semibold text-ink truncate">
                      {t.subject || t.dealId}
                    </p>
                    <TicketStatusPill status={t.status} />
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-[12px] text-muted">{t.dealId}</p>
                    <span className="text-muted/40">·</span>
                    <p className="text-[12px] text-muted">
                      {new Date(t.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
