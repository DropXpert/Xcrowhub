import type { Feedback } from "@/types/deal";
import { StarRating } from "./StarRating";
import { formatRelative } from "@/lib/time";
import { ProfileAvatar } from "./ProfileAvatar";

function shortenAddr(addr: string) {
  const c = addr.replace(/\s+/g, "");
  return c.length <= 12 ? addr : `${c.slice(0, 6)}…${c.slice(-4)}`;
}

export function FeedbackCard({ feedback }: { feedback: Feedback }) {
  return (
    <div className="rounded-lg border border-edge bg-bg px-4 py-3.5 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <ProfileAvatar address={feedback.fromAddr} size="sm" />
          <span className="font-mono text-[12.5px] text-muted truncate">
            {shortenAddr(feedback.fromAddr)}
          </span>
          <span className="pill border-edge bg-surface text-muted text-[12px] shrink-0">
            {feedback.fromRole === "buyer" ? "Buyer" : "Seller"}
          </span>
        </div>
        <span className="text-[12px] text-muted shrink-0">
          {formatRelative(feedback.createdAt)}
        </span>
      </div>
      <StarRating value={feedback.rating} size="sm" />
      {feedback.comment ? (
        <p className="break-words [overflow-wrap:anywhere] text-[13.5px] text-ink leading-relaxed">{feedback.comment}</p>
      ) : null}
    </div>
  );
}
