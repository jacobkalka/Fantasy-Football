import type { Metadata } from "next";
import { WatchlistScreen } from "@/components/players/WatchlistScreen";
import { SectionTabs } from "@/components/shell/SectionTabs";
import { PageTitle } from "@/components/ui/bits";

export const metadata: Metadata = { title: "Watchlist" };

export default function WatchlistPage() {
  return (
    <>
      <SectionTabs section="/players" current="/players/watchlist" />
      <PageTitle sub="Players you're keeping an eye on, saved on this device">Watchlist</PageTitle>
      <WatchlistScreen />
    </>
  );
}
