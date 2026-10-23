import type { Metadata } from "next";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { PageTitle } from "@/components/ui/bits";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageTitle sub="Your league, how the app looks, and where your team is saved">Settings</PageTitle>
      <SettingsScreen />
    </>
  );
}
