import type { Metadata } from "next";
import { ComingUp } from "@/components/ui/ComingUp";

export const metadata: Metadata = { title: "Live feed" };

export default function FeedPage() {
  return (
    <ComingUp title="Feed" phase={5}>
      <p>
        Every play that scored (or cost) your players points, newest on top, in plain English,
        with the point change attached.
      </p>
      <p>
        Filter by your players, all games, scoring plays only, or injuries.
      </p>
    </ComingUp>
  );
}
