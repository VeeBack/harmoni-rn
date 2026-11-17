import Native from "harmoni-player";
import { create } from "zustand";

import { resetOrigin } from "@/api/client";
import { Api } from "@/api/endpoints";
import type { Me } from "@/api/types";
import { kv } from "@/lib/storage";

interface SessionStore {
  signedIn: boolean;
  server: string | null;
  me: Me | null;
  setMe: (me: Me) => void;
  refreshMe: () => Promise<Me | null>;
  didSignIn: () => void;
  signOut: () => Promise<void>;
}

const initial = Native.getSession();

export const useSession = create<SessionStore>((set, get) => ({
  signedIn: !!initial,
  server: initial?.server ?? null,
  me: kv.get<Me | null>("me", null),
  setMe: (me) => {
    kv.set("me", me);
    set({ me });
  },
  refreshMe: async () => {
    try {
      const me = await Api.me();
      get().setMe(me);
      return me;
    } catch {
      return null;
    }
  },
  didSignIn: () => {
    resetOrigin();
    const s = Native.getSession();
    set({ signedIn: !!s, server: s?.server ?? null, me: null });
    kv.remove("me");
    get().refreshMe();
  },
  signOut: async () => {
    await signOutHooks.reduce((p, h) => p.then(h).catch(() => {}), Promise.resolve());
    await Native.signOut();
    resetOrigin();
    kv.remove("me");
    kv.remove("listens.pending");
    set({ signedIn: false, server: null, me: null });
  },
}));

/** Things to tidy before signing out (player, link, caches) register here. */
export const signOutHooks: (() => Promise<void> | void)[] = [];

Native.addListener("onSignedOut", async () => {
  // The server ended this sign-in: tidy up exactly like signing out here.
  await signOutHooks.reduce((p, h) => p.then(h).catch(() => {}), Promise.resolve());
  await Native.signOut().catch(() => {});
  resetOrigin();
  kv.remove("me");
  kv.remove("listens.pending");
  useSession.setState({ signedIn: false, server: null, me: null });
});

export const features = () =>
  useSession.getState().me?.server.features ?? { superProcessing: true, autoplay: true, link: true, lyrics: true };
