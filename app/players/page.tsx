import type { Metadata } from "next";
import { PlayerBrowser } from "@/components/players/PlayerBrowser";
import { SectionTabs } from "@/components/shell/SectionTabs";
import { PageTitle } from "@/components/ui/bits";

export const metadata: Metadata = { title: "Players" };

export default function PlayersPage() {
  return (
    <>
      <SectionTabs section="/players" current="/players" />
      <PageTitle sub="Every NFL player: search, browse, and open a profile">Players</PageTitle>
      <PlayerBrowser />
    </>
  );
}
