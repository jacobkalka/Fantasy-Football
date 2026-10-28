import type { Metadata } from "next";
import { Suspense } from "react";
import { ImportTeam } from "@/components/team/ImportTeam";
import { PageTitle, Skeleton } from "@/components/ui/bits";

export const metadata: Metadata = { title: "Open a team link" };

export default function ImportPage() {
  return (
    <>
      <PageTitle sub="A team someone (or you) shared from Xpert">Open a team link</PageTitle>
      {/* Reads ?t= from the URL, which needs a Suspense boundary. */}
      <Suspense fallback={<Skeleton className="h-60 rounded-[20px]" />}>
        <ImportTeam />
      </Suspense>
    </>
  );
}
