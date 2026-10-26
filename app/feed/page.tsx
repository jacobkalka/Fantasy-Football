import type { Metadata } from "next";
import { Suspense } from "react";
import { FeedList } from "@/components/feed/FeedList";
import { Screen } from "@/components/motion/Screen";
import { SectionTabs } from "@/components/shell/SectionTabs";
import { PageTitle, Skeleton } from "@/components/ui/bits";

export const metadata: Metadata = { title: "Live" };

export default function FeedPage() {
  return (
    <Screen>
      <div>
        <SectionTabs section="/feed" current="/feed" />
        <PageTitle sub="Your team, your opponent and the players you track, play by play">Live</PageTitle>
      </div>
      {/* The tab and week live in the URL, which needs a Suspense boundary. */}
      <Suspense fallback={<Skeleton className="h-40 rounded-[22px]" />}>
        <FeedList />
      </Suspense>
    </Screen>
  );
}
