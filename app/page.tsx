import { Suspense } from "react";
import { Screen } from "@/components/motion/Screen";
import { TeamDashboard } from "@/components/team/TeamDashboard";
import { PageTitle, Skeleton } from "@/components/ui/bits";

export default function TeamPage() {
  return (
    <Screen>
      <PageTitle kicker="Live fantasy">My team</PageTitle>
      {/* The dashboard reads ?week= from the URL, which needs a Suspense boundary. */}
      <Suspense fallback={<Skeleton className="h-64 rounded-3xl" />}>
        <TeamDashboard />
      </Suspense>
    </Screen>
  );
}
