import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/ComingSoon";

export const metadata: Metadata = { title: "Player" };

export default function PlayerPage() {
  return (
    <ComingSoon
      section="/players"
      current="/players"
      title="Player profile"
      what="A full profile for this player: who he is, how he's used, recent games, and whether he'd help your team."
    />
  );
}
