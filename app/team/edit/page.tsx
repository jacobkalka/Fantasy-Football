import type { Metadata } from "next";
import Link from "next/link";
import { Screen } from "@/components/motion/Screen";
import { PlayerSearch } from "@/components/team/PlayerSearch";
import { RosterEditor } from "@/components/team/RosterEditor";
import { PageTitle } from "@/components/ui/bits";

export const metadata: Metadata = { title: "Edit team" };

export default function EditTeamPage() {
  return (
    <Screen>
      <div className="flex items-end justify-between">
        <PageTitle kicker="Saved on this device">Edit team</PageTitle>
        <Link
          href="/"
          transitionTypes={["nav-back"]}
          className="glass-gain pressable mb-4 rounded-xl px-4 py-2 font-mono text-[11px] font-bold tracking-[0.1em] text-gain uppercase"
        >
          Done
        </Link>
      </div>
      <RosterEditor />
      <PlayerSearch />
    </Screen>
  );
}
