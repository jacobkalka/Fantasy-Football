import type { Metadata } from "next";
import { ComingUp } from "@/components/ui/ComingUp";

export const metadata: Metadata = { title: "Games" };

export default function GamesPage() {
  return (
    <ComingUp title="Games" phase={1}>
      <p>
        All of this week&apos;s NFL games with real team logos, live scores, the clock, the
        quarter, and who has the ball.
      </p>
      <p>Tap a game for its play-by-play, drives, and key stats.</p>
    </ComingUp>
  );
}
