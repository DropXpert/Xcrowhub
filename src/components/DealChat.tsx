import { useState, useEffect, useRef } from "react";
import { MessageCircle, Send, ArrowLeft } from "lucide-react";
import { useDealChatStore } from "@/store/dealChatStore";
import { useAuthStore } from "@/store/authStore";
import type { Deal } from "@/types/deal";

function shortenAddr(addr: string) {
  const c = addr.replace(/\s+/g, "");
  return c.length <= 12 ? addr : `${c.slice(0, 6)}…${c.slice(-4)}`;
}

interface DealChatProps {
  deal: Deal;
  viewerRole: "buyer" | "seller";
}

export function DealChat({ deal, viewerRole }: DealChatProps) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  const { loadChat, subscribeChat } = useDealChatStore();

  useEffect(() => {
    if (open) {
      setUnread(0);
      loadChat(deal.id);
    }
  }, [open, deal.id, loadChat]);

  useEffect(() => {
    const unsub = subscribeChat(deal.id, (msg) => {
      if (!open && msg.senderRole !== viewerRole) {
        setUnread((n) => n + 1);
      }
    });
    return unsub;
  }, [deal.id, open, viewerRole, subscribeChat]);

  return (
    <>
      {/* Floating chat button */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-24 right-4 z-40 flex h-13 w-13 items-center justify-center rounded-full bg-accent shadow-lg transition hover:bg-accent-ink active:scale-95"
          style={{ height: 52, width: 52 }}
          title="Deal chat"
        >
          <MessageCircle className="h-5 w-5 text-white" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-danger text-[11px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      )}

      {/* Full-screen chat overlay */}
      {open && (
        <ChatOverlay
          deal={deal}
          viewerRole={viewerRole}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ChatOverlay({
  deal,
  viewerRole,
  onClose,
}: {
  deal: Deal;
  viewerRole: "buyer" | "seller";
  onClose: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sendLock = useRef(false);

  const { chats, loadChat, sendMessage, subscribeChat } = useDealChatStore();
  const session = useAuthStore((s) => s.session);

  const thread = chats[deal.id];
  const msgs = thread?.messages ?? [];

  const senderAddr =
    session?.address ??
    (viewerRole === "buyer" ? deal.buyerWalletAddress ?? "" : deal.sellerWalletAddress);

  const otherRole = viewerRole === "buyer" ? "seller" : "buyer";
  const otherAddr =
    viewerRole === "buyer" ? deal.sellerWalletAddress : deal.buyerWalletAddress ?? "";

  useEffect(() => {
    loadChat(deal.id);
    const unsub = subscribeChat(deal.id, () => {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    });
    return unsub;
  }, [deal.id, loadChat, subscribeChat]);

  useEffect(() => {
    if (msgs.length) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (sendLock.current || sending) return;
    if (!draft.trim()) return;
    sendLock.current = true;
    setSending(true);
    setError(null);
    try {
      await sendMessage(deal.id, senderAddr, viewerRole, draft.trim());
      setDraft("");
      inputRef.current?.focus();
    } catch (err: any) {
      setError(err.message ?? "Failed to send.");
    } finally {
      setSending(false);
      sendLock.current = false;
    }
  }

  return (
    // z-[60] above BottomNav (z-50). Inner wrapper max-w-app so the chat
    // aligns with the 480px mini-app frame on wide viewports instead of
    // stretching edge-to-edge.
    <div className="fixed inset-0 z-[60] flex flex-col bg-bg">
      <div className="mx-auto flex w-full max-w-app flex-1 min-h-0 flex-col">
      {/* Header */}
      <div className="safe-top flex shrink-0 items-center gap-3 border-b border-edge bg-surface px-4 py-3">
        <button type="button" onClick={onClose} className="text-muted hover:text-ink transition">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-ink truncate">
            Chat with {otherRole}
          </p>
          <p className="font-mono text-[12px] text-muted truncate">
            {otherAddr ? shortenAddr(otherAddr) : "Waiting for buyer"} · {deal.id}
          </p>
        </div>
        <span className="pill border-accent/30 bg-accent-soft text-accent-ink text-[12px]">
          Live
        </span>
      </div>

      {/* Messages — min-h-0 lets flex-1 actually shrink on short viewports. */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
        {thread?.loading && (
          <p className="text-center text-[13px] text-muted py-8">Loading messages...</p>
        )}

        {!thread?.loading && msgs.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <MessageCircle className="h-8 w-8 text-muted/30" />
            <div className="space-y-1">
              <p className="text-[14px] font-semibold text-ink">No messages yet</p>
              <p className="text-[12.5px] text-muted max-w-[200px]">
                Chat with the {otherRole} about this deal. Messages are visible to both parties.
              </p>
            </div>
          </div>
        )}

        {msgs.map((msg) => {
          const isMe = msg.senderRole === viewerRole;
          const isSystem = msg.senderRole === "system";

          if (isSystem) {
            return (
              <div key={msg.id} className="flex justify-center">
                <span className="max-w-full break-words [overflow-wrap:anywhere] rounded-md border border-edge bg-bg px-3 py-1 text-[12px] text-muted">
                  {msg.body}
                </span>
              </div>
            );
          }

          return (
            <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 ${
                  isMe
                    ? "rounded-br-sm bg-accent text-white"
                    : "rounded-bl-sm bg-surface border border-edge text-ink"
                }`}
              >
                {!isMe && (
                  <p className="text-[11px] font-semibold uppercase tracking-wider opacity-60 mb-1 capitalize">
                    {msg.senderRole}
                  </p>
                )}
                <p className="text-[14px] leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                  {msg.body}
                </p>
                <p className={`text-[11px] mt-0.5 ${isMe ? "text-white/60" : "text-muted"}`}>
                  {new Date(msg.createdAt).toLocaleTimeString(undefined, {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input — real safe-area padding so the field never sits under the
          iOS home indicator or the parent app's gesture bar. */}
      <div className="safe-bottom shrink-0 border-t border-edge bg-surface px-4 pt-3">
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            ref={inputRef}
            className="input flex-1 text-[14px] py-2.5"
            placeholder={`Message ${otherRole}...`}
            value={draft}
            maxLength={1000}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend(e as any);
              }
            }}
            disabled={sending}
            autoFocus
          />
          <button
            type="submit"
            className="btn-primary px-3 py-2.5"
            disabled={!draft.trim() || sending}
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
        {error && <p className="text-[12.5px] text-danger mt-1">{error}</p>}
        <p className="text-[12px] text-muted mt-1.5 text-center">
          Both parties can see all messages in this chat.
        </p>
      </div>
      </div>
    </div>
  );
}
