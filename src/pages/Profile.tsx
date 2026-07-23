import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useParams, Link } from "react-router-dom";
import { Pencil, X, Camera, Package, ShieldCheck, Gift, ChevronRight } from "lucide-react";
import { CopyButton } from "@/components/CopyButton";
import { Progress, ProgressTrack } from "@/components/ui/progress";
import { useDealStore } from "@/store/dealStore";
import { useAuthStore, useIsAdmin } from "@/store/authStore";
import { useProfileStore } from "@/store/profileStore";
import { useListingStore } from "@/store/listingStore";
import { PageHeader } from "@/components/PageHeader";
import { DealCard } from "@/components/DealCard";
import { StarRating } from "@/components/StarRating";
import { FeedbackCard } from "@/components/FeedbackCard";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { TelegramConnectCard } from "@/components/TelegramConnectCard";

type HistoryTab = "seller" | "buyer" | "listings";

function shortenAddr(addr: string) {
  const c = addr.replace(/\s+/g, "");
  return c.length <= 16 ? addr : `${c.slice(0, 8)}…${c.slice(-6)}`;
}

function compactAddr(addr: string) {
  const c = addr.replace(/\s+/g, "");
  return c.length <= 4 ? c : `${c.slice(0, 1)}...${c.slice(-1)}`;
}

async function resizeImageToDataUrl(file: File, maxPx = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = reject;
    img.src = url;
  });
}

export default function Profile() {
  const { address } = useParams<{ address: string }>();
  const addr = decodeURIComponent(address ?? "");

  const session = useAuthStore((s) => s.session);
  const isOwn = !!session && session.address.toLowerCase() === addr.toLowerCase();
  const adminSession = useIsAdmin();
  const isAdmin = isOwn && adminSession;

  const deals = useDealStore((s) => s.deals);
  const getFeedbacksForAddress = useDealStore((s) => s.getFeedbacksForAddress);

  const getProfile = useProfileStore((s) => s.getProfile);
  const setProfile = useProfileStore((s) => s.setProfile);
  const profile = getProfile(addr);
  const fetchMine = useListingStore((s) => s.fetchMine);
  const myListings = useListingStore((s) => s.myListings);

  useEffect(() => {
    if (addr) fetchMine(addr);
  }, [addr, fetchMine]);

  const [tab, setTab] = useState<HistoryTab>("seller");
  const [editing, setEditing] = useState(false);
  const [confirmingUsername, setConfirmingUsername] = useState(false);
  const [draftUsername, setDraftUsername] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const usernameInputRef = useRef<HTMLInputElement>(null);

  const receivedFeedbacks = useMemo(
    () =>
      getFeedbacksForAddress(addr).sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      ),
    [addr, getFeedbacksForAddress]
  );

  const allDeals = useMemo(() => Object.values(deals), [deals]);

  const asSeller = useMemo(
    () =>
      allDeals
        .filter(
          (d) => d.sellerWalletAddress.toLowerCase() === addr.toLowerCase()
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [allDeals, addr]
  );

  const asBuyer = useMemo(
    () =>
      allDeals
        .filter(
          (d) => d.buyerWalletAddress?.toLowerCase() === addr.toLowerCase()
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [allDeals, addr]
  );

  const stats = useMemo(() => {
    const completed =
      asSeller.filter((d) =>
        ["released", "refunded", "partially_refunded"].includes(d.status)
      ).length +
      asBuyer.filter((d) =>
        ["released", "refunded", "partially_refunded"].includes(d.status)
      ).length;

    const disputed = [...asSeller, ...asBuyer].filter((d) =>
      [
        "proof_window",
        "under_admin_review",
        "refunded",
        "partially_refunded",
      ].includes(d.status)
    ).length;

    const total = asSeller.length + asBuyer.length;
    const disputeRate = total > 0 ? Math.round((disputed / total) * 100) : 0;

    const avgRating = receivedFeedbacks.length
      ? receivedFeedbacks.reduce((s, f) => s + f.rating, 0) /
        receivedFeedbacks.length
      : 0;

    const ratingDist = [5, 4, 3, 2, 1].map((star) => ({
      star,
      count: receivedFeedbacks.filter((f) => f.rating === star).length,
    }));

    return { completed, disputed, disputeRate, avgRating, ratingDist };
  }, [asSeller, asBuyer, receivedFeedbacks]);

  function startEdit() {
    if (!isAdmin && (profile.usernameLocked || profile.username.trim())) return;
    setDraftUsername(isAdmin ? profile.username : "");
    setConfirmingUsername(false);
    setEditing(true);
  }

  function saveEdit() {
    if (!isAdmin && (profile.usernameLocked || profile.username.trim())) {
      setConfirmingUsername(false);
      setEditing(false);
      return;
    }
    setProfile(
      addr,
      { username: draftUsername.trim().slice(0, 32) },
      { allowUsernameOverwrite: isAdmin }
    );
    setConfirmingUsername(false);
    setEditing(false);
  }

  const handlePhotoChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const dataUrl = await resizeImageToDataUrl(file, 256);
        setProfile(addr, { avatarDataUrl: dataUrl });
      } catch {
        // ignore
      }
      e.target.value = "";
    },
    [addr, setProfile]
  );

  const historyList = tab === "seller" ? asSeller : asBuyer;

  return (
    <div className="space-y-4 lg:mx-auto lg:max-w-4xl">
      <PageHeader eyebrow="Profile" title="Trader profile" />

      {/* Profile header — identity + at-a-glance stats in one card */}
      <section className="card overflow-visible" data-tour="profile-identity">
        <div className="flex items-start gap-2.5 px-3.5 pb-3 pt-3.5 sm:px-5 sm:pb-4 sm:pt-5">
          {/* Avatar with edit affordance. On desktop the tap target lights up
              a Camera overlay on hover; on mobile a small pencil badge in the
              corner keeps the "you can edit this" cue always visible. */}
          <div className="relative shrink-0">
            <span className="block rounded-full ring-2 ring-edge/60">
              <ProfileAvatar
                address={addr}
                size="md"
                avatarDataUrl={profile.avatarDataUrl}
              />
            </span>
            {isOwn && (
              <>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition hover:opacity-100"
                  title="Change photo"
                  aria-label="Change profile photo"
                >
                  <Camera className="h-4 w-4 text-white" />
                </button>
                {/* Persistent edit badge — visible without hover so mobile
                    users know the avatar is tappable. Shares the same file
                    picker as the hover overlay above. */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-0 right-0 grid h-5 w-5 place-items-center rounded-full border-2 border-surface bg-accent text-white shadow-receipt transition hover:scale-105 active:scale-95"
                  title="Change photo"
                  aria-label="Change profile photo"
                >
                  <Pencil className="h-2.5 w-2.5" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoChange}
                />
              </>
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-1.5 overflow-hidden">
            {/* Username row */}
            <div className="flex min-w-0 items-center gap-2">
              {profile.username ? (
                <span className="min-w-0 truncate text-[15px] font-bold tracking-tight text-ink">
                  {profile.username}
                </span>
              ) : isOwn ? (
                <span className="truncate text-[12.5px] italic text-muted">
                  No username set
                </span>
              ) : (
                <span className="min-w-0 truncate font-mono text-[13.5px] font-semibold text-ink">
                  {shortenAddr(addr)}
                </span>
              )}
              {isOwn && (isAdmin || (!profile.usernameLocked && !profile.username.trim())) && (
                <button
                  type="button"
                  onClick={startEdit}
                  className="grid h-6 w-6 shrink-0 place-items-center text-muted transition hover:text-ink"
                  title="Edit username"
                  aria-label="Edit username"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
              {isAdmin && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent px-1.5 py-0.5 text-[10.5px] font-semibold text-white">
                  <ShieldCheck className="h-2.5 w-2.5" />
                  Admin
                </span>
              )}
            </div>

            {isOwn && profile.avatarDataUrl && (
              <button
                type="button"
                onClick={() => setProfile(addr, { avatarDataUrl: null })}
                className="text-[11px] text-muted transition hover:text-danger"
              >
                Remove photo
              </button>
            )}
          </div>

          {/* Wallet address — top-right corner */}
          <span
            className="inline-flex max-w-[4.25rem] shrink-0 items-center gap-1 rounded-full border border-edge bg-bg px-1.5 py-0.5 sm:max-w-[5rem]"
            title={addr}
          >
            <span className="min-w-0 truncate font-mono text-[10.5px] text-muted">
              {compactAddr(addr)}
            </span>
            <CopyButton text={addr} className="h-[18px] w-[18px] shrink-0" />
          </span>
        </div>

        {/* At-a-glance stats */}
        <div className="grid grid-cols-4 divide-x divide-edge border-t border-edge">
          {[
            { label: "Deals", value: asSeller.length + asBuyer.length },
            { label: "Completed", value: stats.completed },
            {
              label: "Rating",
              value: receivedFeedbacks.length
                ? stats.avgRating.toFixed(1) + "★"
                : "—",
            },
            { label: "Disputes", value: `${stats.disputeRate}%` },
          ].map(({ label, value }) => (
            <div key={label} className="px-1 py-2.5 text-center">
              <p className="text-[14px] font-bold leading-none tabular-nums text-ink">
                {value}
              </p>
              <p className="mt-1 text-[9.5px] font-medium uppercase tracking-wide text-muted">
                {label}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Refer & earn (own profile only) */}
      {isOwn && (
        <Link
          to="/referral"
          data-tour="profile-referral"
          className="card flex items-center gap-3 px-5 py-4 transition hover:bg-bg"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <Gift className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-ink">Refer &amp; earn</p>
            <p className="text-[13px] text-muted">
              Earn 10% of the fee on every sale your referrals make.
            </p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
        </Link>
      )}

      {/* Telegram notifications (own profile only) */}
      {isOwn && (
        <div data-tour="profile-notifications">
          <TelegramConnectCard />
        </div>
      )}

      {/* Rating distribution */}
      {receivedFeedbacks.length > 0 && (
        <section className="card px-5 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-semibold text-ink">Ratings</h3>
            <div className="flex items-center gap-1.5">
              <StarRating value={Math.round(stats.avgRating)} size="sm" />
              <span className="text-[13px] font-semibold text-ink">
                {stats.avgRating.toFixed(1)}
              </span>
              <span className="text-[12.5px] text-muted">
                ({receivedFeedbacks.length})
              </span>
            </div>
          </div>
          <div className="space-y-1.5">
            {stats.ratingDist.map(({ star, count }) => {
              const pct = receivedFeedbacks.length
                ? Math.round((count / receivedFeedbacks.length) * 100)
                : 0;
              return (
                <div
                  key={star}
                  className="flex items-center gap-2 text-[12.5px]"
                >
                  <span className="w-3 text-right text-muted">{star}</span>
                  <span className="text-warning">★</span>
                  <Progress value={pct} className="flex-1" aria-label={`${star} star ratings`}>
                    <ProgressTrack className="h-1.5 bg-edge" indicatorClassName="bg-warning" />
                  </Progress>
                  <span className="w-7 text-right text-muted">{count}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Feedback wall */}
      {receivedFeedbacks.length > 0 && (
        <section className="card px-5 py-4 space-y-3">
          <h3 className="text-[15px] font-semibold text-ink">
            Feedback ({receivedFeedbacks.length})
          </h3>
          <ul className="space-y-3">
            {receivedFeedbacks.slice(0, 10).map((f) => (
              <li key={f.id}>
                <FeedbackCard feedback={f} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {receivedFeedbacks.length === 0 && (
        <div className="card px-5 py-6 text-center space-y-1">
          <p className="text-[14px] font-medium text-ink">No feedback yet</p>
          <p className="text-[13px] text-muted">
            Feedback appears after deals are finalized.
          </p>
        </div>
      )}

      {/* Deal history + Listings */}
      <section className="space-y-3">
        <div className="flex gap-1 rounded-xl bg-bg p-1" data-tour="profile-activity">
          {(
            [
              ["seller", "Selling", asSeller.length],
              ["buyer", "Buying", asBuyer.length],
              [
                "listings",
                "Listings",
                myListings.filter((l) => l.status !== "deleted").length,
              ],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex-1 rounded-lg py-2 text-[12.5px] font-medium transition ${
                tab === key
                  ? "bg-surface text-ink shadow-receipt"
                  : "text-muted hover:text-ink"
              }`}
            >
              {label}
              <span
                className={`ml-1 tabular-nums ${
                  tab === key ? "text-accent" : "text-muted/60"
                }`}
              >
                {count}
              </span>
            </button>
          ))}
        </div>

        {tab === "listings" ? (
          myListings.filter((l) => l.status !== "deleted").length === 0 ? (
            <div className="card space-y-3 px-5 py-8 text-center">
              <p className="text-[13px] text-muted">No listings yet.</p>
              {isOwn && (
                <Link to="/listings/new" className="btn-secondary inline-flex items-center gap-2 text-[13px]">
                  <Package className="h-4 w-4" />
                  Create a listing
                </Link>
              )}
            </div>
          ) : (
            <ul className="card divide-y divide-edge overflow-hidden">
              {myListings.filter((l) => l.status !== "deleted").map((l) => (
                <li key={l.id}>
                  <Link to={`/listings/${l.id}`} className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-bg">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-ink">{l.title}</p>
                      <p className="text-[12px] text-muted">{l.priceAmount} {l.priceCurrency} · {l.ordersCount} orders</p>
                    </div>
                    <span className={`pill shrink-0 text-[12px] ${l.status === "active" ? "border-accent/30 bg-accent-soft text-accent-ink" : "border-edge bg-bg text-muted"}`}>
                      {l.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )
        ) : historyList.length > 0 ? (
          <ul className="space-y-2">
            {historyList.slice(0, 20).map((d) => (
              <li key={d.id}>
                <DealCard deal={d} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="card px-5 py-8 text-center text-[13px] text-muted">
            No {tab === "seller" ? "sales" : "purchases"} yet.
          </div>
        )}
      </section>

      {editing &&
        createPortal(
          <div
            className="fixed inset-0 z-[120] flex min-h-0 items-center justify-center overflow-y-auto px-4 py-3 focus-within:items-start focus-within:py-2"
          >
            <button
              type="button"
              className="absolute inset-0 cursor-default bg-black/55 backdrop-blur-[2px]"
              aria-label="Close username editor"
              onClick={() => setEditing(false)}
            />
            <form
              role="dialog"
              aria-modal="true"
              aria-labelledby="username-editor-title"
              className="relative z-10 w-full max-w-sm space-y-4 overflow-y-auto rounded-2xl border border-edge bg-surface p-5 shadow-lift"
              style={{ maxHeight: "calc(100dvh - 1rem)" }}
              onSubmit={(e) => {
                e.preventDefault();
                if (confirmingUsername) saveEdit();
                else if (draftUsername.trim()) {
                  usernameInputRef.current?.blur();
                  setConfirmingUsername(true);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") setEditing(false);
              }}
            >
              {confirmingUsername ? (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 id="username-editor-title" className="text-[16px] font-semibold text-ink">
                        {isAdmin ? "Update admin username?" : "Set this name permanently?"}
                      </h2>
                      <p className="mt-1 text-[13px] leading-relaxed text-muted">
                        Your username will be <span className="font-semibold text-ink">{draftUsername.trim()}</span>.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setConfirmingUsername(false); setEditing(false); }}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-bg hover:text-ink"
                      aria-label="Close"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {isAdmin ? (
                    <p className="rounded-lg border border-accent/30 bg-accent-soft px-3 py-2.5 text-[13px] font-medium leading-relaxed text-accent">
                      Admin usernames can be updated again later.
                    </p>
                  ) : (
                    <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-[13px] font-medium leading-relaxed text-warning">
                      You can set your username only once. After confirming, it cannot be changed again.
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-2.5">
                    <button type="button" onClick={() => setConfirmingUsername(false)} className="btn-secondary w-full">
                      Go back
                    </button>
                    <button type="submit" className="btn-primary w-full">
                      Confirm name
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 id="username-editor-title" className="text-[16px] font-semibold text-ink">
                        Choose username
                      </h2>
                      <p className="mt-1 text-[13px] leading-relaxed text-muted">
                        This name appears on your profile and marketplace activity.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditing(false)}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-bg hover:text-ink"
                      aria-label="Close"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <label className="block space-y-1.5">
                    <span className="field-label">Username</span>
                    <input
                      ref={usernameInputRef}
                      className="input text-[16px]"
                      placeholder="Username (max 32 chars)"
                      value={draftUsername}
                      maxLength={32}
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      inputMode="text"
                      enterKeyHint="done"
                      onChange={(e) => setDraftUsername(e.target.value)}
                    />
                  </label>

                  <p className={`text-[12.5px] leading-relaxed ${isAdmin ? "text-muted" : "text-warning"}`}>
                    {isAdmin
                      ? "Admin accounts can update this name whenever needed."
                      : "Choose carefully. You will not be able to edit this name later."}
                  </p>

                  <div className="grid grid-cols-2 gap-2.5">
                    <button type="button" onClick={() => setEditing(false)} className="btn-secondary w-full">
                      Cancel
                    </button>
                    <button type="submit" disabled={!draftUsername.trim()} className="btn-primary w-full">
                      Review name
                    </button>
                  </div>
                </>
              )}
            </form>
          </div>,
          document.body
        )}
    </div>
  );
}
