import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ProfileData {
  username: string;
  usernameLocked: boolean;
  avatarDataUrl: string | null;
}

interface ProfileState {
  profiles: Record<string, ProfileData>;
  getProfile: (addr: string) => ProfileData;
  setProfile: (
    addr: string,
    data: Partial<ProfileData>,
    options?: { allowUsernameOverwrite?: boolean }
  ) => void;
}

const DEFAULT: ProfileData = { username: "", usernameLocked: false, avatarDataUrl: null };

export const useProfileStore = create<ProfileState>()(
  persist(
    (set, get) => ({
      profiles: {},

      getProfile: (addr) => {
        const stored = get().profiles[addr.toLowerCase()];
        if (!stored) return DEFAULT;

        // Profiles saved before the one-time-name rule do not have the lock
        // field. A non-empty existing name is treated as already consumed so
        // upgrading the app cannot reopen editing for that account.
        return {
          ...DEFAULT,
          ...stored,
          usernameLocked: stored.usernameLocked ?? !!stored.username?.trim(),
        };
      },

      setProfile: (addr, data, options) =>
        set((s) => {
          const key = addr.toLowerCase();
          const stored = s.profiles[key];
          const current: ProfileData = {
            ...DEFAULT,
            ...stored,
            usernameLocked: stored?.usernameLocked ?? !!stored?.username?.trim(),
          };
          const next: ProfileData = {
            ...current,
            avatarDataUrl:
              data.avatarDataUrl === undefined ? current.avatarDataUrl : data.avatarDataUrl,
          };

          // Username can move from empty -> non-empty exactly once. Ignore
          // later writes even if another UI path accidentally calls setProfile.
          if (
            data.username !== undefined &&
            (options?.allowUsernameOverwrite || (!current.usernameLocked && !current.username.trim()))
          ) {
            const username = data.username.trim().slice(0, 32);
            if (username) {
              next.username = username;
              next.usernameLocked = !options?.allowUsernameOverwrite;
            }
          }

          return {
            profiles: {
              ...s.profiles,
              [key]: next,
            },
          };
        }),
    }),
    { name: "proofhold.profiles.v1" }
  )
);
