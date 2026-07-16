export function nowIso() {
  return new Date().toISOString();
}

export function addHoursIso(iso: string, hours: number) {
  const t = new Date(iso).getTime() + hours * 3600_000;
  return new Date(t).toISOString();
}

export function msUntil(iso: string | undefined) {
  if (!iso) return 0;
  return new Date(iso).getTime() - Date.now();
}

export function formatCountdown(ms: number) {
  if (ms <= 0) return "00:00:00";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function formatDateTime(iso: string | undefined) {
  if (!iso) return "n/a";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatRelative(iso: string | undefined) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}
