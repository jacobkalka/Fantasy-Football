import type { Metadata } from "next";
import { Suspense } from "react";
import { Screen } from "@/components/motion/Screen";
import { StartSitScreen } from "@/components/startsit/StartSitScreen";
import { PageTitle, Skeleton } from "@/components/ui/bits";

export const metadata: Metadata = { title: "Start/Sit" };

export default function StartSitPage() {
  return (
    <Screen>
      <PageTitle kicker="Who should I start?">Start/Sit</PageTitle>
      {/* The screen reads ?ids= from the URL, which needs a Suspense boundary. */}
      <Suspense fallback={<Skeleton className="h-96 rounded-3xl" />}>
        <StartSitScreen />
      </Suspense>
    </Screen>
  );
}
