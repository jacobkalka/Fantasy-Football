import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { GamesBoard } from "@/components/games/GamesBoard";
import { Reveal, Screen } from "@/components/motion/Screen";
import { Notice, PageTitle, Skeleton } from "@/components/ui/bits";
import { getScoreboard } from "@/lib/data/sports";

export const metadata: Metadata = { title: "Games" };

async function Board() {
  // Live scores are always fetched for a real visitor, never baked in at build time.
  await connection();
  const board = await getScoreboard().catch(() => null);
  if (!board) {
    return (
      <Notice title="Data delayed" tone="warn">
        ESPN isn&apos;t responding right now. This page will fill in as soon as it does; try
        refreshing in a minute.
      </Notice>
    );
  }
  return (
    <Reveal>
      <GamesBoard initial={board} />
    </Reveal>
  );
}

function BoardSkeleton() {
  return (
    <Reveal fallback>
      <div className="flex flex-col gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 rounded-3xl" />
        ))}
      </div>
    </Reveal>
  );
}

export default function GamesPage() {
  return (
    <Screen>
      <PageTitle kicker="This week">Games</PageTitle>
      <Suspense fallback={<BoardSkeleton />}>
        <Board />
      </Suspense>
    </Screen>
  );
}
