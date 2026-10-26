"use client";

import { TeamSwitcher } from "@/components/teams/TeamSwitcher";

/** The Team screen's title is the team itself, with the switcher built in. */
export function TeamTitle() {
  return (
    <div className="flex items-center justify-between gap-4 pt-3 pb-4 lg:pt-6">
      <h1 className="sr-only">My team</h1>
      <TeamSwitcher variant="hero" />
    </div>
  );
}
