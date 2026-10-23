"use client";

import { OfflineIndicator } from "./OfflineIndicator";
import { UpdatePrompt } from "./UpdatePrompt";

/**
 * Mount once in the root layout. Starts offline support (production builds only) and shows
 * the "Offline" pill and the "Update ready" prompt, stacked just above the phone tab bar
 * (bottom corner on desktop, where there's no tab bar).
 */
export function PwaRoot() {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--tabbar-height)+max(10px,var(--safe-bottom))+12px)] z-[45] flex flex-col items-center gap-2 px-4 lg:right-[max(24px,var(--safe-right))] lg:bottom-[max(24px,var(--safe-bottom))] lg:left-auto lg:items-end lg:px-0"
    >
      <OfflineIndicator />
      <UpdatePrompt />
    </div>
  );
}
