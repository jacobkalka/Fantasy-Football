import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/ComingSoon";

export const metadata: Metadata = { title: "Trade ideas" };

export default function Page() {
  return <ComingSoon section="/trades" current="/trades" title="Trade ideas" what="Trades that fix your team's weak spots without hurting the rest of your lineup." />;
}
