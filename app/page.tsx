import { HomeDashboard } from "@/components/home/HomeDashboard";
import { PageTitle } from "@/components/ui/bits";
import { HomeTitle } from "@/components/home/HomeTitle";

export default function HomePage() {
  return (
    <>
      <PageTitle sub="What needs your attention this week">
        <HomeTitle />
      </PageTitle>
      <HomeDashboard />
    </>
  );
}
