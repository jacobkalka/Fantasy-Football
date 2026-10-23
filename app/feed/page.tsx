import type { Metadata } from "next";
import { Suspense } from "react";
import { FeedList } from "@/components/feed/FeedList";
import { Screen } from "@/components/motion/Screen";
import { SectionTabs } from "@/components/shell/SectionTabs";
import { PageTitle, Skeleton } from "@/components/ui/bits";

export const metadata: Metadata = { title: "Plays" };

export default function FeedPage() {
  return (
    <Screen>
      <div>
        <SectionTabs section="/feed" current="/feed" />
        <PageTitle sub="Every play that moves your points, as it happens">Plays</PageTitle>
      </div>
      <Suspense fallback={<Skeleton className="h-40 rounded-3xl" />}>
        <FeedList />
      </Suspense>
    </Screen>
  );
}
