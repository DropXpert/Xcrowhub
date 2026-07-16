import { Sun, Moon } from "lucide-react";
import { useThemeStore } from "@/store/themeStore";
import { cn } from "@/lib/cn";

export function ThemeToggleButton({ className }: { className?: string }) {
  const { theme, toggle } = useThemeStore();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "relative h-8 w-8 overflow-hidden rounded-lg border border-edge bg-surface transition active:scale-95",
        "hover:border-accent/40 hover:bg-accent-soft",
        className
      )}
    >
      {/* Sun — visible in light mode, slides down when switching to dark */}
      <span
        className="absolute inset-0 grid place-items-center text-warning"
        style={{
          transition: "transform 0.35s cubic-bezier(0.22,1,0.36,1), opacity 0.25s ease",
          transform: isDark ? "translateY(40%) rotate(45deg)" : "translateY(0) rotate(0deg)",
          opacity: isDark ? 0 : 1,
        }}
      >
        <Sun className="h-4 w-4" />
      </span>
      {/* Moon — visible in dark mode, slides in from above */}
      <span
        className="absolute inset-0 grid place-items-center text-accent"
        style={{
          transition: "transform 0.35s cubic-bezier(0.22,1,0.36,1), opacity 0.25s ease",
          transform: isDark ? "translateY(0) rotate(0deg)" : "translateY(-40%) rotate(-45deg)",
          opacity: isDark ? 1 : 0,
        }}
      >
        <Moon className="h-4 w-4" />
      </span>
    </button>
  );
}
