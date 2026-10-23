import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { GamesBoard } from "@/components/games/GamesBoard";
import { Reveal, Screen } from "@/components/motion/Screen";
import { SectionTabs } from "@/components/shell/SectionTabs";
import { Notice, PageTitle, Skeleton } from "@/components/ui/bits";
import { getScoreboard } from "@/lib/data/sports";

export const metadata: Metadata = { title: "Games" };

async function Board({ searchParams }: { searchParams: PageProps<"/games">["searchParams"] }) {
  // Live scores are always fetched for a real visitor, never baked in at build time.
  await connection();
  const requested = Number((await searchParams).week);
  const current = await getScoreboard().catch(() => null);
  const week = Number.isInteger(requested) && requested > 0 && requested <= 18 ? requested : undefined;
  const board =
    current && week && week !== current.week
      ? await getScoreboard(week, current.season).catch(() => null)
      : current;
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
      <GamesBoard key={board.week} initial={board} currentWeek={current?.week ?? board.week} />
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

export default function GamesPage(props: PageProps<"/games">) {
  return (
    <Screen>
      <div>
        <SectionTabs section="/feed" current="/games" />
        <PageTitle sub="Scores, odds and kickoffs for every game this week">Games</PageTitle>
      </div>
      <Suspense fallback={<BoardSkeleton />}>
        <Board searchParams={props.searchParams} />
      </Suspense>
    </Screen>
  );
}
