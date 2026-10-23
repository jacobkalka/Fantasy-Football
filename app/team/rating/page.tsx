import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/ComingSoon";

export const metadata: Metadata = { title: "Team rating" };

export default function Page() {
  return <ComingSoon section="/team" current="/team/rating" title="Team rating" what="Your team rated out of 100, position by position, with your weak spots ranked and what would fix them." />;
}
