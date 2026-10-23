import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/ComingSoon";

export const metadata: Metadata = { title: "Trade calculator" };

export default function Page() {
  return <ComingSoon section="/trades" current="/trades/calculator" title="Trade calculator" what="Build any trade and see your lineup, depth and rating before and after." />;
}
