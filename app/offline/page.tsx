import type { Metadata } from "next";
import { PageTitle } from "@/components/ui/bits";
import { Icon } from "@/components/ui/Icon";
import { RetryButton } from "./RetryButton";
import { SavedScreens } from "./SavedScreens";

export const metadata: Metadata = { title: "Offline", robots: { index: false, follow: false } };

/**
 * What the service worker (public/sw.js) shows when there's no connection and no saved copy
 * of the screen you opened. Built once at deploy time and stored on the phone when the app is
 * installed, so it must never depend on live data.
 */
export default function OfflinePage() {
  return (
    <>
      <PageTitle sub="No internet connection right now">You&apos;re offline</PageTitle>
      <div className="card flex flex-col items-start gap-4 p-5">
        <Icon name="wifiOff" className="text-faint" />
        <div>
          <p className="text-[15px] leading-6 font-medium">This screen isn&apos;t saved on this device yet.</p>
          <p className="mt-1 text-[14px] leading-5 text-muted">
            Screens you&apos;ve opened before still work without a connection. Live scores, projections and
            news load again as soon as you&apos;re back online. Your team is saved on this device.
          </p>
        </div>
        <RetryButton />
      </div>
      <SavedScreens />
    </>
  );
}
