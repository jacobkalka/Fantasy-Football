"use client";

import { usePathname, useRouter } from "next/navigation";
import { startTransition } from "react";
import { Segmented } from "@/components/ui/Segmented";

/** "This week · Last week" switch, stored in the URL (?week=6) so it survives a refresh. */
export function WeekPicker({ currentWeek, week }: { currentWeek: number; week?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  if (currentWeek <= 1) return null;
  const options = [
    { value: "now", label: `Week ${currentWeek}` },
    { value: String(currentWeek - 1), label: `Week ${currentWeek - 1}` },
  ] as const;
  const value = week && week !== currentWeek ? String(week) : "now";
  return (
    <Segmented
      options={options}
      value={value}
      label="Week"
      onChange={(v) =>
        startTransition(() => router.replace(v === "now" ? pathname : `${pathname}?week=${v}`, { scroll: false }))
      }
    />
  );
}
