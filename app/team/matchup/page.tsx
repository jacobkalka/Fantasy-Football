import type { Metadata } from "next";
import { MatchupScreen } from "@/components/matchup/MatchupScreen";
import { SectionTabs } from "@/components/shell/SectionTabs";
import { PageTitle } from "@/components/ui/bits";

export const metadata: Metadata = { title: "Matchup" };

export default function MatchupPage() {
  return (
    <>
      <SectionTabs section="/team" current="/team/matchup" />
      <PageTitle>Matchup</PageTitle>
      <MatchupScreen />
    </>
  );
}
