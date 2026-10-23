import type { Metadata } from "next";
import { AccountPanel } from "@/components/auth/AccountPanel";
import { Screen } from "@/components/motion/Screen";
import { PageTitle } from "@/components/ui/bits";

export const metadata: Metadata = { title: "Account" };

export default function AccountPage() {
  return (
    <Screen>
      <PageTitle kicker="You">Account</PageTitle>
      <AccountPanel />
    </Screen>
  );
}
