"use client";

import { Icon } from "@/components/ui/Icon";
import { useIsOffline } from "./hooks";

/**
 * A small "Offline" pill while the device has no connection. Screens you've opened before
 * still show (from the service worker); live numbers wait for the connection.
 *
 * Renders inline (no positioning); PwaRoot places it above the tab bar.
 */
export function OfflineIndicator({ className = "" }: { className?: string }) {
  const offline = useIsOffline();
  if (!offline) return null;

  return (
    <div
      role="status"
      data-pwa="offline-indicator"
      className={`pointer-events-auto flex items-center gap-2 rounded-full bg-raised px-4 py-2 text-[13px] leading-5 text-muted shadow-[0_12px_32px_rgb(0_0_0/0.6)] ${className}`}
    >
      <Icon name="wifiOff" size={16} className="text-faint" />
      <span>
        <span className="font-medium text-ink">Offline</span> · showing saved screens
      </span>
    </div>
  );
}
