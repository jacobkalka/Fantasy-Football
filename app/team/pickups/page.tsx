import type { Metadata } from "next";
import { Suspense } from "react";
import { SectionTabs } from "@/components/shell/SectionTabs";
import { PickupsScreen } from "@/components/trades/PickupsScreen";
import { PageTitle, Skeleton } from "@/components/ui/bits";

export const metadata: Metadata = { title: "Pickups" };

export default function PickupsPage() {
  return (
    <>
      <SectionTabs section="/team" current="/team/pickups" />
      <PageTitle sub="Available players who'd make your team better, and who you'd drop">Pickups</PageTitle>
      <Suspense fallback={<Skeleton className="h-64 rounded-[22px]" />}>
        <PickupsScreen />
      </Suspense>
    </>
  );
}
