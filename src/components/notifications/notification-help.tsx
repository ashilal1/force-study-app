"use client";

import { useSyncExternalStore } from "react";
import { detectPlatform, type Platform } from "@/lib/push-client";
import { SettingsGuide } from "./settings-guide";

const noop = () => () => {};

/** The per-OS banner/sound guide outside of setup, with the viewer's OS opened. */
export function NotificationHelp() {
  const platform = useSyncExternalStore<Platform>(noop, detectPlatform, () => "other");
  return <SettingsGuide platform={platform} focus="sound" />;
}
