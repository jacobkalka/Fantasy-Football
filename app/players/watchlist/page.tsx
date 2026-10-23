import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/ComingSoon";

export const metadata: Metadata = { title: "Watchlist" };

export default function Page() {
  return <ComingSoon section="/players" current="/players/watchlist" title="Watchlist" what="Players you're keeping an eye on, with their latest numbers." />;
}
