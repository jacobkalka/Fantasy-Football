import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { GameCenter } from "@/components/gamecenter/GameCenter";
import { Reveal, Screen } from "@/components/motion/Screen";
import { Notice, Skeleton } from "@/components/ui/bits";
import { getGameDetail } from "@/lib/data/sports";
import { buildGameView } from "@/lib/live/game-view";

export const metadata: Metadata = { title: "Game Center" };

async function Center({ params }: { params: PageProps<"/games/[id]">["params"] }) {
  // Live games are always fetched for a real visitor, never baked in at build time.
  await connection();
  const { id } = await params;
  const detail = /^\d{6,12}$/.test(id) ? await getGameDetail(id).catch(() => null) : null;
  if (!detail) {
    return (
      <Notice title="Data delayed" tone="warn">
        Couldn&apos;t load this game from ESPN. Try again in a minute.
      </Notice>
    );
  }
  // Starts in PPR; the page switches to your league's scoring as soon as it loads on your phone.
  return (
    <Reveal>
      <GameCenter initial={buildGameView(detail, "ppr")} />
    </Reveal>
  );
}

export default function GamePage(props: PageProps<"/games/[id]">) {
  return (
    <Screen>
      <Link
        href="/games"
        transitionTypes={["nav-back"]}
        className="self-start px-1 pt-2 font-mono text-[11px] tracking-[0.1em] text-muted uppercase hover:text-ink"
      >
        ← All games
      </Link>
      <Suspense
        fallback={
          <Reveal fallback>
            <div className="flex flex-col gap-4">
              <Skeleton className="h-56 rounded-3xl" />
              <Skeleton className="h-16 rounded-3xl" />
              <Skeleton className="h-96 rounded-3xl" />
            </div>
          </Reveal>
        }
      >
        <Center params={props.params} />
      </Suspense>
    </Screen>
  );
}
