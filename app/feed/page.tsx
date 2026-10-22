import type { Metadata } from "next";
import { Suspense } from "react";
import { FeedList } from "@/components/feed/FeedList";
import { Screen } from "@/components/motion/Screen";
import { PageTitle, Skeleton } from "@/components/ui/bits";

export const metadata: Metadata = { title: "Live feed" };

export default function FeedPage() {
  return (
    <Screen>
      <PageTitle kicker="Every play that moves your points">Feed</PageTitle>
      <Suspense fallback={<Skeleton className="h-40 rounded-3xl" />}>
        <FeedList />
      </Suspense>
    </Screen>
  );
}
