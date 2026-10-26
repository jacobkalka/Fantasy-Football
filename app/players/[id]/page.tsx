import type { Metadata } from "next";
import { Suspense } from "react";
import { PlayerProfile } from "@/components/player/PlayerProfile";
import { SectionTabs } from "@/components/shell/SectionTabs";
import { Skeleton } from "@/components/ui/bits";

export const metadata: Metadata = { title: "Player" };

/** Reads the id from the URL (request-time data), so it renders inside Suspense. */
async function Profile({ params }: { params: PageProps<"/players/[id]">["params"] }) {
  const { id } = await params;
  if (!/^-?\d{1,12}$/.test(id)) {
    return <p className="card p-5 text-[15px]">That isn&apos;t a player link FantasyLab recognizes.</p>;
  }
  return <PlayerProfile playerId={id} />;
}

/**
 * The full-page version of the one player profile (deep links, new tabs, sharing). Inside the
 * app, tapping a player opens the same profile over the current screen instead.
 */
export default function PlayerPage(props: PageProps<"/players/[id]">) {
  return (
    <>
      <SectionTabs section="/team" current="/players" />
      <div className="pt-3">
        <Suspense fallback={<Skeleton className="h-80 rounded-[20px]" />}>
          <Profile params={props.params} />
        </Suspense>
      </div>
    </>
  );
}
