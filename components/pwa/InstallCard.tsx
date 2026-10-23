"use client";

import { useState } from "react";
import { Mark } from "@/components/shell/Brand";
import { Button } from "@/components/ui/Button";
import { Card, Pill } from "@/components/ui/Card";
import { APP_NAME } from "@/lib/config";
import { useNow } from "@/lib/hooks/useNow";
import { usePreference } from "@/lib/hooks/usePreference";
import { promptInstall, useInstallRoute, type InstallRoute } from "./install";
import { InstallSheet } from "./InstallSheet";

const HIDE_FOR_MS = 30 * 24 * 60 * 60 * 1000;

/** Open the browser's dialog right away where there is one; otherwise show the steps. */
function useInstallAction(route: InstallRoute | null) {
  const [sheet, setSheet] = useState(false);
  const start = async () => {
    if (route === "prompt") {
      const outcome = await promptInstall();
      if (outcome !== "unavailable") return;
    }
    setSheet(true);
  };
  return { start, sheet: <InstallSheet open={sheet} onClose={() => setSheet(false)} route={route} /> };
}

/**
 * "Get the app" at the bottom of Home, for people using FantasyLab in a browser tab.
 * "Not now" hides it for 30 days; Settings → Install the app is always there.
 */
export function InstallCard({ className = "" }: { className?: string }) {
  const route = useInstallRoute();
  const [hiddenUntil, setHiddenUntil] = usePreference<string>("install-card-hidden-until", "0");
  const { start, sheet } = useInstallAction(route);
  const now = useNow(60_000);
  const hidden = now === 0 || Number(hiddenUntil) > now;

  if (!route || route === "installed" || route === "just-installed" || route === "unsupported" || hidden) return sheet;
  return (
    <Card as="section" aria-labelledby="install-card-title" className={`flex flex-col gap-4 sm:flex-row sm:items-center ${className}`}>
      <div className="flex min-w-0 flex-1 items-center gap-3.5">
        <span className="grid size-12 shrink-0 place-items-center rounded-[13px] bg-well">
          <Mark size={24} />
        </span>
        <div className="min-w-0">
          <h2 id="install-card-title" className="text-[16px] leading-6 font-semibold">
            Get the {APP_NAME} app
          </h2>
          <p className="text-[13px] leading-5 text-muted">
            Full screen from your Home Screen, straight to your team. Screens you&apos;ve opened work offline.
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button icon="download" onClick={start}>
          Install
        </Button>
        <Button variant="quiet" onClick={() => setHiddenUntil(String(now + HIDE_FOR_MS))}>
          Not now
        </Button>
      </div>
      {sheet}
    </Card>
  );
}

/** Settings row: whether the app is installed, and how to install it. */
export function InstallSetting() {
  const route = useInstallRoute();
  const { start, sheet } = useInstallAction(route);
  const installed = route === "installed" || route === "just-installed";
  return (
    <>
      {route === null ? (
        <span className="block h-8 w-20" aria-hidden="true" />
      ) : installed ? (
        <Pill tone="positive">Installed</Pill>
      ) : (
        <Button size="sm" icon="download" onClick={start}>
          {route === "prompt" ? "Install" : "How to install"}
        </Button>
      )}
      {sheet}
    </>
  );
}

/** The words under "Install the app" in Settings. */
export function installHint(route: InstallRoute | null): string {
  switch (route) {
    case "installed":
      return "You're using the installed app.";
    case "just-installed":
      return `Installed. Open ${APP_NAME} from your Home Screen or app list.`;
    case "unsupported":
      return "This browser can't install web apps. Chrome, Edge or Safari can.";
    case "ios-safari":
    case "ios-browser":
    case "ios-in-app":
      return "Add it to your Home Screen: full screen, no browser bars, and it remembers your team.";
    default:
      return "Its own icon and window, full screen, and screens you've opened work offline.";
  }
}
