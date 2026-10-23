import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/ComingSoon";

export const metadata: Metadata = { title: "Pickups" };

export default function Page() {
  return <ComingSoon section="/players" current="/players/pickups" title="Pickups" what="Players likely available in your league who would actually improve your roster, with the reasons." />;
}
