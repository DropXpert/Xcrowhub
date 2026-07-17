import { useState, useEffect, useRef } from "react";
import { Send, MessageCircle, ArrowLeft, Plus, CheckCircle2, Clock, ChevronRight } from "lucide-react";
import { useSupportStore } from "@/store/supportStore";
import type { SupportTicket } from "@/store/supportStore";
import { useDealStore } from "@/store/dealStore";
import { useAuthStore } from "@/store/authStore";
import { PageHeader } from "@/components/PageHeader";
import { ChatSkeleton, SkeletonDots } from "@/components/LoadingStates";

type View = "list" | "new" | "chat";

function TicketStatusPill({ status }: { status: "open" | "resolved" }) {
  return status === "resolved" ? (
    <span className="pill border-accent/30 bg-accent-soft text-accent-ink text-[12px]">Resolved</span>
  ) : (
    <span className="pill border-warning/40 bg-warning/10 text-warning text-[12px]">Open</span>
  );
}

// Full-screen chat overlay — avoids any app-shell height/overflow conflicts
function ChatOverlay({
  ticket,
  onClose,
}: {
  ticket: SupportTicket;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sendLock = useRef(false);

  const { loadThread, sendMessage, subscribeThread, reopenTicket, threads } = useSupportStore();
  const session = useAuthStore((s) => s.session);
  const getDeal = useDealStore((s) => s.getDeal);

  const addr = session?.address ?? "";
  const chatThread = threads[ticket.id];
  const msgs = chatThread?.messages ?? [];
  const deal = getDeal(ticket.dealId);
  const isResolved = ticket.status === "resolved";

  useEffect(() => {
    loadThread(ticket.id, ticket.dealId);
    const unsub = subscribeThread(ticket.id, ticket.dealId, () => {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    });
    return unsub;
  }, [ticket.id, ticket.dealId, loadThread, subscribeThread]);

  useEffect(() => {
    if (msgs.length) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [msgs.length]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (sendLock.current || sending) return;
    if (!draft.trim() || isResolved) return;
    sendLock.current = true;
    setSending(true);
    setChatError(null);
    try {
      await sendMessage(ticket.id, ticket.dealId, draft.trim(), "user", addr);
      setDraft("");
      inputRef.current?.focus();
    } catch (err: any) {
      setChatError(err.message ?? "Failed to send.");
    } finally {
      setSending(false);
      sendLock.current = false;
    }
  }

  return (
    // z-[60] sits above BottomNav (z-50) so the input isn't hidden. Inner
    // wrapper is max-w-app so the chat aligns with the mini-app frame on
    // wide viewports instead of bleeding edge-to-edge on the desktop shell.
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
          <p className="text-[12px] text-muted font-mono truncate">
            {ticket.dealId}{deal ? ` · ${deal.title}` : ""}
          </p>
        </div>
        <TicketStatusPill status={ticket.status} />
      </div>

      {/* Messages — flex-1 + min-h-0 lets the flex child shrink so the
          input bar stays in view on short viewports. */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
        {chatThread?.loading && <ChatSkeleton />}
        {!chatThread?.loading && msgs.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <MessageCircle className="h-7 w-7 text-muted/40" />
            <p className="text-[13px] text-muted">No messages yet. Our team will reply shortly.</p>
          </div>
        )}
        {msgs.map((msg) => {
          const isUser = msg.sender === "user";
          return (
            <div key={msg.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 ${
                isUser
                  ? "rounded-br-sm bg-accent text-white"
                  : "rounded-bl-sm bg-surface border border-edge text-ink"
              }`}>
                {!isUser && (
                  <p className="text-[11px] font-semibold uppercase tracking-wider opacity-60 mb-1">Support</p>
                )}
                <p className="text-[14px] leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{msg.body}</p>
                <p className={`text-[11px] mt-0.5 ${isUser ? "text-white/60" : "text-muted"}`}>
                  {new Date(msg.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                </p>
              </div>
            </div>
          );
        })}
        {isResolved && (
          <div className="flex justify-center py-2">
            <span className="flex items-center gap-1.5 rounded-md border border-accent/30 bg-accent-soft px-2.5 py-1 text-[12px] text-accent-ink">
              <CheckCircle2 className="h-3 w-3" />
              Ticket resolved
            </span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar — always pinned to bottom, with real safe-area padding
          so the field never sits under the iOS home indicator. */}
      <div className="safe-bottom shrink-0 border-t border-edge bg-surface px-4 pt-3">
        {isResolved ? (
          <div className="flex items-center justify-center gap-2 py-1 text-[13px] text-muted">
            <span>Ticket resolved.</span>
            <button
              type="button"
              className="text-accent hover:underline font-medium"
              onClick={() => reopenTicket(ticket.id)}
            >
              Reopen?
            </button>
          </div>
        ) : (
          <form onSubmit={handleSend} className="flex gap-2">
            <input
              ref={inputRef}
              className="input flex-1 text-[14px] py-2.5"
              placeholder="Type your message..."
              value={draft}
              maxLength={1000}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(e as any); }
              }}
              disabled={sending}
              autoFocus
            />
            <button
              type="submit"
              className="btn-primary px-3 py-2.5"
              disabled={!draft.trim() || sending}
            >
              {sending ? <SkeletonDots label="Sending support message" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
        )}
        {chatError && <p className="text-[12.5px] text-danger mt-1">{chatError}</p>}
      </div>
      </div>
    </div>
  );
}

export default function Support() {
  const [view, setView] = useState<View>("list");
  const [activeTicket, setActiveTicket] = useState<SupportTicket | null>(null);

  const [dealIdInput, setDealIdInput] = useState("");
  const [subjectInput, setSubjectInput] = useState("");
  const [firstMsg, setFirstMsg] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const createLock = useRef(false);

  const { myTickets, loadMyTickets, createTicket, sendMessage } = useSupportStore();
  const session = useAuthStore((s) => s.session);
  const addr = session?.address ?? "";

  useEffect(() => {
    if (addr) loadMyTickets(addr);
  }, [addr, loadMyTickets]);

  function openTicket(ticket: SupportTicket) {
    setActiveTicket(ticket);
    setView("chat");
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (createLock.current || creating) return;
    const dealId = dealIdInput.trim().toUpperCase();
    if (!dealId) return setFormError("Enter a deal ID.");
    if (!subjectInput.trim()) return setFormError("Add a subject.");
    if (!firstMsg.trim()) return setFormError("Describe your issue.");
    createLock.current = true;
    setCreating(true);
    setFormError(null);
    try {
      const ticket = await createTicket(dealId, subjectInput.trim(), addr);
      await sendMessage(ticket.id, dealId, firstMsg.trim(), "user", addr);
      setDealIdInput(""); setSubjectInput(""); setFirstMsg("");
      setActiveTicket(ticket);
      setView("chat");
    } catch (err: any) {
      setFormError(err.message ?? "Failed to create ticket.");
    } finally {
      setCreating(false);
      createLock.current = false;
    }
  }

  // Chat rendered as fixed overlay
  if (view === "chat" && activeTicket) {
    return (
      <ChatOverlay
        ticket={activeTicket}
        onClose={() => { setView("list"); setActiveTicket(null); }}
      />
    );
  }

  // New ticket form
  if (view === "new") {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setView("list")} className="text-muted hover:text-ink transition">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h2 className="text-[15px] font-semibold text-ink">New support ticket</h2>
        </div>

        <form onSubmit={handleCreate} className="card px-5 py-5 space-y-4" data-tour="support-new-ticket">
          <div className="space-y-1.5">
            <label className="field-label">Deal ID</label>
            <input
              className="input font-mono text-[14px] uppercase"
              placeholder="PH-XXXX-XXXX"
              value={dealIdInput}
              maxLength={64}
              onChange={(e) => setDealIdInput(e.target.value)}
            />
            <p className="text-[12px] text-muted">Found on your deal status page.</p>
          </div>
          <div className="space-y-1.5">
            <label className="field-label">Subject</label>
            <input
              className="input text-[14px]"
              placeholder="e.g. Delivery not received"
              value={subjectInput}
              maxLength={80}
              onChange={(e) => setSubjectInput(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="field-label">Describe your issue</label>
            <textarea
              className="textarea text-[14px]"
              rows={4}
              placeholder="What happened? Include any relevant details, links, or transaction hashes."
              value={firstMsg}
              maxLength={2000}
              onChange={(e) => setFirstMsg(e.target.value)}
            />
          </div>
          {formError && <p className="text-[12.5px] text-danger">{formError}</p>}
          <button type="submit" className="btn-primary w-full" disabled={creating}>
            {creating && <SkeletonDots label="Creating support ticket" />}
            {creating ? "Creating..." : "Open ticket"}
          </button>
        </form>
      </div>
    );
  }

  // Ticket list
  const openTickets = myTickets.filter((t) => t.status === "open");
  const resolvedTickets = myTickets.filter((t) => t.status === "resolved");

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between" data-tour="support-new-ticket">
        <PageHeader eyebrow="Help" title="Support" back={false} />
        <button type="button" onClick={() => setView("new")} className="btn-primary flex items-center gap-1.5 px-3 py-2 text-[13px]">
          <Plus className="h-3.5 w-3.5" />
          New ticket
        </button>
      </div>

      <div data-tour="support-history">
      {myTickets.length === 0 ? (
        <div className="card px-5 py-10 flex flex-col items-center gap-4 text-center">
          <MessageCircle className="h-8 w-8 text-muted/40" />
          <div className="space-y-1">
            <p className="text-[14px] font-semibold text-ink">No tickets yet</p>
            <p className="text-[12.5px] text-muted max-w-[220px]">
              Open a support ticket for any deal query. Our team will reply directly in the chat.
            </p>
          </div>
          <button type="button" onClick={() => setView("new")} className="btn-primary">
            <Plus className="h-4 w-4" />
            Open first ticket
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {openTickets.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-warning" />
                <p className="text-[12.5px] font-semibold uppercase tracking-wider text-muted">Open</p>
              </div>
              <ul className="space-y-2">
                {openTickets.map((t) => <TicketRow key={t.id} ticket={t} onOpen={openTicket} />)}
              </ul>
            </section>
          )}
          {resolvedTickets.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
                <p className="text-[12.5px] font-semibold uppercase tracking-wider text-muted">Resolved</p>
              </div>
              <ul className="space-y-2">
                {resolvedTickets.map((t) => <TicketRow key={t.id} ticket={t} onOpen={openTicket} />)}
              </ul>
            </section>
          )}
        </div>
      )}
      </div>
    </div>
  );
}

function TicketRow({ ticket, onOpen }: { ticket: SupportTicket; onOpen: (t: SupportTicket) => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(ticket)}
        className="card w-full text-left px-4 py-3.5 hover:shadow-lift transition flex items-center gap-3"
      >
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
          ticket.status === "open" ? "bg-warning/10" : "bg-accent-soft"
        }`}>
          <MessageCircle className={`h-4 w-4 ${ticket.status === "open" ? "text-warning" : "text-accent"}`} />
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] font-semibold text-ink truncate">{ticket.subject || ticket.dealId}</p>
            <TicketStatusPill status={ticket.status} />
          </div>
          <p className="font-mono text-[12px] text-muted">{ticket.dealId}</p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
      </button>
    </li>
  );
}
