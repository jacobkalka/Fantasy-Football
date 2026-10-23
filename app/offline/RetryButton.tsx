"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

/**
 * The screen the person was trying to open: the service worker sends them here as
 * /offline?from=/games. Only same-site paths are followed.
 */
function wantedPath() {
  const from = new URLSearchParams(window.location.search).get("from");
  return from && from.startsWith("/") && !from.startsWith("//") ? from : null;
}

/**
 * "Try again" (installed apps have no reload button): goes back to the screen that couldn't load.
 * Also goes back by itself when the phone reports the connection is back.
 */
export function RetryButton() {
  useEffect(() => {
    const onOnline = () => {
      const from = wantedPath();
      if (from) window.location.replace(from);
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  return (
    <Button
      variant="primary"
      size="lg"
      icon="refresh"
      onClick={() => {
        const from = wantedPath();
        if (from) window.location.assign(from);
        else window.location.reload();
      }}
    >
      Try again
    </Button>
  );
}
