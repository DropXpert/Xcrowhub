import { isNimiqPayHost } from "@/lib/host";

function shouldManageBottomNav() {
  if (typeof window === "undefined") return false;
  if (isNimiqPayHost()) return true;
  const host = window.location.hostname;
  return host === "app.xcrowhub.com" || host === "localhost" || host === "127.0.0.1";
}

function isEditable(element: Element | null): boolean {
  return (
    element instanceof HTMLElement &&
    element.matches(
      "input:not([type='checkbox']):not([type='radio']):not([type='file']), textarea, [contenteditable='true']"
    ) &&
    !element.hasAttribute("readonly") &&
    !element.hasAttribute("disabled")
  );
}

/**
 * The host browser owns keyboard geometry. This guard deliberately tracks
 * focus only, so typing can hide the app nav without changing any viewport,
 * document, or scroll dimensions.
 */
export function installInputFocusNavGuard(): () => void {
  if (!shouldManageBottomNav()) return () => {};

  const update = () => {
    const focused = isEditable(document.activeElement);
    document.documentElement.classList.toggle("input-focused", focused);
    document.body?.classList.toggle("input-focused", focused);
  };
  const onFocusIn = () => update();
  const onFocusOut = () => window.setTimeout(update, 0);

  document.addEventListener("focusin", onFocusIn);
  document.addEventListener("focusout", onFocusOut);
  update();

  return () => {
    document.removeEventListener("focusin", onFocusIn);
    document.removeEventListener("focusout", onFocusOut);
    document.documentElement.classList.remove("input-focused");
    document.body?.classList.remove("input-focused");
  };
}
