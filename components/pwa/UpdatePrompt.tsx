"use client";

import { useState } from "react";
import { buttonClass, IconButton } from "@/components/ui/Button";
import { usePwaUpdate } from "./hooks";

/**
 * "Update ready": shown when a new version has been downloaded. Nothing changes until the
 * person taps Update (then the page reloads once). "Later" hides it for now; the new version
 * also starts by itself the next time the app is opened fresh.
 *
 * Renders inline (no positioning); PwaRoot places it above the tab bar.
 */
export function UpdatePrompt({ className = "" }: { className?: string }) {
  const { updateReady, updating, applyUpdate } = usePwaUpdate();
  const [dismissed, setDismissed] = useState(false);
  if (!updateReady || (dismissed && !updating)) return null;

  return (
    <div
      role="status"
      data-pwa="update-prompt"
      className={`pointer-events-auto flex items-center gap-1 rounded-full bg-raised py-1.5 pr-1.5 pl-4 text-[14px] leading-5 text-ink shadow-[0_12px_32px_rgb(0_0_0/0.6)] ${className}`}
    >
      <span className="pr-2">{updating ? "Updating…" : "Update ready"}</span>
      <button
        type="button"
        onClick={applyUpdate}
        disabled={updating}
        className={buttonClass("primary", "sm")}
      >
        Update
      </button>
      {!updating && <IconButton icon="close" label="Later" size={32} onClick={() => setDismissed(true)} />}
    </div>
  );
}
