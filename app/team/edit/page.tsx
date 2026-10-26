import type { Metadata } from "next";
import { SectionTabs } from "@/components/shell/SectionTabs";
import { PlayerSearch } from "@/components/team/PlayerSearch";
import { RosterEditor } from "@/components/team/RosterEditor";
import { ButtonLink } from "@/components/ui/Button";
import { PageTitle } from "@/components/ui/bits";

export const metadata: Metadata = { title: "Roster" };

export default function EditTeamPage() {
  return (
    <>
      <SectionTabs section="/team" current="/team" />
      <PageTitle
        sub="Saved on this device, and to your account when you sign in"
        actions={
          <ButtonLink href="/team" variant="primary">
            Done
          </ButtonLink>
        }
      >
        Roster
      </PageTitle>
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <RosterEditor />
        <PlayerSearch />
      </div>
    </>
  );
}
