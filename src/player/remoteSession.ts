import Native from "harmoni-player";

import type { QueueSong } from "@/api/types";
import { deviceId, onlineDevices, positionNow, useLink } from "@/link/link";
import { player } from "./player";

// While another device plays over Harmoni Link, Android's media controls
// (notification, lock screen, widget, car) show that device's song, and the
// output chip shows its name instead of "This phone". Their buttons become
// Link commands. Picking a device in Android's output switcher moves playback.

let lastSent = "";
let lastQueue: QueueSong[] | null = null;
let lastDevices = "";

function sync() {
  const l = useLink.getState();
  const devices = l.enabled && l.connected ? onlineDevices() : [];

  // Devices for the output switcher: everyone but this phone.
  const others = devices.filter((d) => d.id !== deviceId).map((d) => ({ id: d.id, name: d.name, kind: d.kind }));
  const remoteActive = l.enabled && l.connected && l.active && l.active !== deviceId ? l.active : null;
  const volume = l.state?.muted ? 0 : (l.state?.volume ?? 1);
  const devKey = JSON.stringify([others, remoteActive, volume]);
  if (devKey !== lastDevices) {
    lastDevices = devKey;
    Native.setLinkDevices(JSON.stringify(others), remoteActive, volume);
  }

  const st = l.state;
  if (!remoteActive || !st?.queue?.length) {
    if (lastSent !== "local") {
      lastSent = "local";
      lastQueue = null;
      Native.setRemote(null).catch(() => {});
    }
    return;
  }
  const name = devices.find((d) => d.id === remoteActive)?.name ?? "another device";
  const key = [remoteActive, name, st.index, st.playing, st.buffering, Math.round(st.positionMs / 1000), st.repeat, st.shuffle, st.volume, st.muted, st.queue === lastQueue].join("|");
  if (key === lastSent) return;
  lastSent = key;
  const body: Record<string, unknown> = {
    deviceId: remoteActive,
    deviceName: name,
    index: st.index,
    playing: st.playing,
    buffering: st.buffering,
    positionMs: Math.round(positionNow(st)),
    durationMs: st.durationMs ?? st.queue[st.index]?.durationMs ?? 0,
    repeat: st.repeat,
    shuffle: st.shuffle,
    volume: st.volume,
    muted: st.muted,
  };
  // The queue only travels when it changed (it can be 500 songs); native keeps the last one.
  if (st.queue !== lastQueue) {
    body.queue = st.queue.slice(0, 500);
    lastQueue = st.queue;
  }
  Native.setRemote(JSON.stringify(body)).catch(() => {});
}

useLink.subscribe(sync);

let pendingVolume: number | null = null;
let volumeTimer: ReturnType<typeof setTimeout> | null = null;

Native.addListener("onRemoteCommand", (c) => {
  const st = useLink.getState().state;
  switch (c.type) {
    case "toggle":
      return player.toggle();
    case "next":
      return player.next();
    case "prev":
      return player.prev();
    case "seek":
      return player.seek(c.positionMs ?? 0);
    case "jumpTo":
      return typeof c.index === "number" ? player.jumpTo(c.index) : undefined;
    case "shuffle":
      return player.setShuffle(!!c.on);
    case "repeat": {
      // Link only cycles off → all → one; step until we land on the asked mode.
      const order = ["off", "all", "one"] as const;
      const from = order.indexOf(st?.repeat ?? "off");
      const to = order.indexOf(c.mode ?? "off");
      for (let i = 0; i < (to - from + 3) % 3; i++) player.cycleRepeat();
      return;
    }
    case "volume":
      // A slider drag sends a burst; pass on only the latest every 150 ms.
      pendingVolume = c.volume ?? 1;
      if (!volumeTimer)
        volumeTimer = setTimeout(() => {
          volumeTimer = null;
          if (pendingVolume !== null) player.setVolume(pendingVolume);
          pendingVolume = null;
        }, 150);
      return;
    case "mute":
      return player.setVolume(c.muted ? 0 : (st?.volume ?? 1));
  }
});

Native.addListener("onSystemTransfer", ({ to }) => {
  player.transferTo(to ?? deviceId).catch(() => {});
});
