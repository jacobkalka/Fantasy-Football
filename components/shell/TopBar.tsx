import Link from "next/link";
import { Suspense } from "react";
import { AccountButton } from "@/components/auth/AccountButton";
import { AdminIndicator } from "./AdminIndicator";
import { Icon } from "@/components/ui/Icon";
import { BackButton } from "./BackButton";
import { Wordmark } from "./Brand";
import { GlobalSearch } from "./GlobalSearch";

/**
 * Phone: the wordmark (with a back arrow on detail screens), search, settings and your
 * account; it scrolls away with the page (the tab bar stays). Desktop: a slim bar with player search and your account.
 */
export function TopBar() {
  return (
    <>
      <header className="pt-[var(--safe-top)] lg:hidden">
        <div className="flex h-14 items-center justify-between gap-2 px-4">
          <div className="flex min-w-0 items-center gap-1">
            {/* Detail screens get a back arrow (the installed app on iPhone has no back button). */}
            <Suspense fallback={null}>
              <BackButton />
            </Suspense>
            <Link href="/" aria-label="FantasyLab home" className="-ml-1 rounded-lg p-1">
              <Wordmark height={19} />
            </Link>
          </div>
          <div className="flex items-center gap-0.5">
            <AdminIndicator />
            <GlobalSearch variant="icon" />
            <Link
              href="/settings"
              aria-label="Settings"
              className="pressable grid size-10 place-items-center rounded-full text-muted hover:bg-raised hover:text-ink"
            >
              <Icon name="settings" />
            </Link>
            <AccountButton compact />
          </div>
        </div>
      </header>
      <header className="sticky top-0 z-30 hidden h-16 items-center gap-4 border-b border-line bg-ground px-10 lg:flex">
        <GlobalSearch variant="field" />
        <div className="flex-1" />
        <AdminIndicator />
        <AccountButton />
      </header>
    </>
  );
}
