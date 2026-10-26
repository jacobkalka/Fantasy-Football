import type { Metadata } from "next";
import { Suspense } from "react";
import { SectionTabs } from "@/components/shell/SectionTabs";
import { TradesScreen } from "@/components/trades/TradesScreen";
import { PageTitle, Skeleton } from "@/components/ui/bits";

export const metadata: Metadata = { title: "Trades" };

export default function TradesPage() {
  return (
    <>
      <SectionTabs section="/team" current="/team/trades" />
      <PageTitle sub="Trades that fix your weak spots, and a calculator for any offer">Trades</PageTitle>
      <Suspense fallback={<Skeleton className="h-64 rounded-[22px]" />}>
        <TradesScreen />
      </Suspense>
    </>
  );
}
