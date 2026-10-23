import { SectionTabs } from "@/components/shell/SectionTabs";
import { PageTitle } from "@/components/ui/bits";
import { EmptyState } from "@/components/ui/States";

/** An honest placeholder for a screen that's being built, instead of a dead link. */
export function ComingSoon({
  section,
  current,
  title,
  what,
}: {
  section?: string;
  current?: string;
  title: string;
  what: string;
}) {
  return (
    <>
      {section && current && <SectionTabs section={section} current={current} />}
      <PageTitle>{title}</PageTitle>
      <EmptyState title="Being built right now" icon="info" action={{ label: "Go to your lineup", href: "/team" }}>
        {what} It will appear here in the next update, using your roster and real NFL data.
      </EmptyState>
    </>
  );
}
