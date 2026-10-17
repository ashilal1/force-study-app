"use client";

import { useEffect } from "react";
import { markAllNotificationsRead } from "@/actions/notifications";

/** Opening the list counts as reading it: unread items stay highlighted for this view only. */
export function MarkAllRead() {
  useEffect(() => {
    // The action refreshes the page, after which this component is no longer rendered.
    const timer = setTimeout(() => void markAllNotificationsRead(), 1500);
    return () => clearTimeout(timer);
  }, []);
  return null;
}
