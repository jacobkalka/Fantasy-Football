"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/supabase/auth";
import { rosterSync, useRosterSync } from "@/lib/supabase/roster-sync";
import { useRoster } from "@/lib/roster/store";
import { FloatingNotice } from "./FloatingNotice";

/**
 * Invisible helper, mounted once in the header: while you're signed in it keeps
 * your team saved to your account (see lib/supabase/roster-sync.ts), and shows
 * a short notice when it had to choose between two different copies.
 */
export function RosterSync() {
  const auth = useAuth();
  const { roster, ready } = useRoster();
  const { notice } = useRosterSync();
  const userId = auth.status === "signed-in" ? auth.user.id : null;

  useEffect(() => {
    if (!ready) return;
    if (userId) {
      rosterSync.start(userId, roster);
      rosterSync.localChanged(roster);
    } else if (auth.status === "signed-out" || auth.status === "disabled") {
      rosterSync.stop();
    }
  }, [userId, auth.status, ready, roster]);

  return <FloatingNotice notice={notice} onDismiss={rosterSync.dismissNotice} />;
}
