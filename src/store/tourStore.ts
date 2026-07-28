import { create } from "zustand";
import { persist } from "zustand/middleware";

export const TOUR_SECTIONS = [
  "home",
  "deals",
  "create-deal",
  "marketplace",
  "create-listing",
  "support",
  "profile",
] as const;

export type TourSection = (typeof TOUR_SECTIONS)[number];

interface UserTourProgress {
  welcomeSeen: boolean;
  seenSections: Partial<Record<TourSection, boolean>>;
}

interface TourState {
  users: Record<string, UserTourProgress>;
  welcomeAddress: string | null;
  activeSection: TourSection | null;
  stepIndex: number;

  registerConnectedUser: (address: string) => void;
  resumeWelcome: (address: string) => void;
  finishWelcome: (address: string) => void;
  startSection: (section: TourSection) => void;
  next: () => void;
  prev: () => void;
  skipSection: (address: string) => void;
  completeSection: (address: string) => void;
}

export function tourUserKey(address: string) {
  return address.replace(/\s+/g, "").toLowerCase();
}

function markActiveSectionSeen(
  state: TourState,
  address: string
): Pick<TourState, "users" | "activeSection" | "stepIndex"> {
  const key = tourUserKey(address);
  const section = state.activeSection;
  if (!section || !state.users[key]) {
    return { users: state.users, activeSection: null, stepIndex: 0 };
  }

  return {
    users: {
      ...state.users,
      [key]: {
        ...state.users[key],
        seenSections: {
          ...state.users[key].seenSections,
          [section]: true,
        },
      },
    },
    activeSection: null,
    stepIndex: 0,
  };
}

/**
 * Onboarding progress is stored per wallet and per section. A wallet is added
 * only after a successful interactive connection, so existing restored users
 * are not incorrectly shown a "new user" welcome after this feature ships.
 */
export const useTourStore = create<TourState>()(
  persist(
    (set, get) => ({
      users: {},
      welcomeAddress: null,
      activeSection: null,
      stepIndex: 0,

      registerConnectedUser: (address) => {
        const key = tourUserKey(address);
        const existing = get().users[key];
        if (existing) {
          if (!existing.welcomeSeen) {
            set({ welcomeAddress: address, activeSection: null, stepIndex: 0 });
          }
          return;
        }

        set((state) => ({
          users: {
            ...state.users,
            [key]: { welcomeSeen: false, seenSections: {} },
          },
          welcomeAddress: address,
          activeSection: null,
          stepIndex: 0,
        }));
      },

      resumeWelcome: (address) => {
        const progress = get().users[tourUserKey(address)];
        if (progress && !progress.welcomeSeen) {
          set({ welcomeAddress: address, activeSection: null, stepIndex: 0 });
        }
      },

      finishWelcome: (address) => {
        const key = tourUserKey(address);
        const progress = get().users[key];
        if (!progress) return;
        set((state) => ({
          users: {
            ...state.users,
            [key]: { ...progress, welcomeSeen: true },
          },
          welcomeAddress: null,
        }));
      },

      startSection: (section) =>
        set({ activeSection: section, stepIndex: 0 }),
      next: () => set((state) => ({ stepIndex: state.stepIndex + 1 })),
      prev: () =>
        set((state) => ({ stepIndex: Math.max(0, state.stepIndex - 1) })),
      skipSection: (address) => set((state) => markActiveSectionSeen(state, address)),
      completeSection: (address) =>
        set((state) => markActiveSectionSeen(state, address)),
    }),
    {
      name: "xcrowhub-section-tours-v1",
      partialize: (state) => ({ users: state.users }),
    }
  )
);
