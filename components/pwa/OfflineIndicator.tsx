"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useIsOffline } from "./hooks";

const BACK_ONLINE_MS = 2500;

/**
 * A small "Offline" pill while the device has no connection (screens you've opened before
 * still show; live numbers wait for the connection), then "Back online" for a moment when
 * it returns, while the screens fetch fresh data.
 *
 * Renders inline (no positioning); PwaRoot places it above the tab bar.
 */
export function OfflineIndicator({ className = "" }: { className?: string }) {
  const offline = useIsOffline();
  const [wasOffline, setWasOffline] = useState(false);
  const [backOnline, setBackOnline] = useState(false);

  // Derived during render: going offline remembers it; coming back shows "Back online".
  if (offline && !wasOffline) {
    setWasOffline(true);
    setBackOnline(false);
  }
  if (!offline && wasOffline) {
    setWasOffline(false);
    setBackOnline(true);
  }

  useEffect(() => {
    if (!backOnline) return;
    const id = window.setTimeout(() => setBackOnline(false), BACK_ONLINE_MS);
    return () => window.clearTimeout(id);
  }, [backOnline]);

  if (!offline && !backOnline) return null;

  return (
    <div
      role="status"
      data-pwa={offline ? "offline-indicator" : "online-indicator"}
      className={`pointer-events-auto flex items-center gap-2 rounded-full bg-raised px-4 py-2 text-[13px] leading-5 text-muted shadow-[0_12px_32px_rgb(0_0_0/0.6)] ${className}`}
    >
      {offline ? (
        <>
          <Icon name="wifiOff" size={16} className="text-faint" />
          <span>
            <span className="font-medium text-ink">Offline</span> · showing saved screens
          </span>
        </>
      ) : (
        <>
          <Icon name="check" size={16} className="text-positive" />
          <span>
            <span className="font-medium text-ink">Back online</span> · updating
          </span>
        </>
      )}
    </div>
  );
}
