import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { sectionForPath } from "@/lib/tourConfig";
import { useAuthStore } from "@/store/authStore";
import { tourUserKey, useTourStore } from "@/store/tourStore";
import { NewUserWelcome } from "@/components/NewUserWelcome";
import { OnboardingTour } from "@/components/OnboardingTour";

export function OnboardingCoordinator() {
  const { pathname } = useLocation();
  const session = useAuthStore((state) => state.session);
  const users = useTourStore((state) => state.users);
  const welcomeAddress = useTourStore((state) => state.welcomeAddress);
  const activeSection = useTourStore((state) => state.activeSection);
  const resumeWelcome = useTourStore((state) => state.resumeWelcome);
  const startSection = useTourStore((state) => state.startSection);

  useEffect(() => {
    const address = session?.address;
    if (!address) return;

    const progress = users[tourUserKey(address)];
    // Only interactively registered wallets are considered new users. This
    // prevents restored accounts from receiving a surprise welcome sequence.
    if (!progress) return;
    if (!progress.welcomeSeen) {
      if (!welcomeAddress) resumeWelcome(address);
      return;
    }
    if (welcomeAddress || activeSection) return;

    const section = sectionForPath(pathname, address);
    if (!section || progress.seenSections[section]) return;

    const timer = window.setTimeout(() => startSection(section), 650);
    return () => window.clearTimeout(timer);
  }, [
    activeSection,
    pathname,
    resumeWelcome,
    session?.address,
    startSection,
    users,
    welcomeAddress,
  ]);

  return (
    <>
      <NewUserWelcome />
      <OnboardingTour />
    </>
  );
}
