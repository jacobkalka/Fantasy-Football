import type { Metadata } from "next";
import { ComingUp } from "@/components/ui/ComingUp";

export const metadata: Metadata = { title: "Start/Sit" };

export default function StartSitPage() {
  return (
    <ComingUp title="Start/Sit" phase={7}>
      <p>
        Pick two players and get a clear recommendation with a confidence level and the reasons
        behind it: projections, matchup, injuries, recent form, and game environment.
      </p>
      <p>The numbers decide. Every reason shows the stats it&apos;s based on.</p>
    </ComingUp>
  );
}
