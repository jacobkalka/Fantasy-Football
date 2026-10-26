import type { Metadata } from "next";
import { Suspense } from "react";
import { SectionTabs } from "@/components/shell/SectionTabs";
import { TeamDashboard } from "@/components/team/TeamDashboard";
import { TeamTitle } from "@/components/team/TeamTitle";
import { Skeleton } from "@/components/ui/bits";

export const metadata: Metadata = { title: "My team" };

export default function TeamPage() {
  return (
    <>
      <SectionTabs section="/team" current="/team" />
      <Suspense fallback={<div className="h-20" />}>
        <TeamTitle />
      </Suspense>
      {/* The lineup reads ?week= from the URL, which needs a Suspense boundary. */}
      <Suspense fallback={<Skeleton className="h-72 rounded-[22px]" />}>
        <TeamDashboard />
      </Suspense>
    </>
  );
}
