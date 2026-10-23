import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/ComingSoon";

export const metadata: Metadata = { title: "Players" };

export default function Page() {
  return <ComingSoon section="/players" current="/players" title="Players" what="Search any NFL player and open a full profile: role, recent form, consistency, and whether he'd help your team." />;
}
