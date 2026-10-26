import type { Metadata } from "next";
import { Suspense } from "react";
import { NewsScreen } from "@/components/news/NewsScreen";
import { PageTitle, Skeleton } from "@/components/ui/bits";

export const metadata: Metadata = { title: "News" };

export default function NewsPage() {
  return (
    <>
      <PageTitle sub="Stories about your players, and the news across the NFL">News</PageTitle>
      {/* The tab lives in the URL, which needs a Suspense boundary. */}
      <Suspense fallback={<Skeleton className="h-72 rounded-[22px]" />}>
        <NewsScreen />
      </Suspense>
    </>
  );
}
