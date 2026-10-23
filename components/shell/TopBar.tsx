import Link from "next/link";
import { AccountButton } from "@/components/auth/AccountButton";
import { Icon } from "@/components/ui/Icon";
import { Wordmark } from "./Brand";
import { GlobalSearch } from "./GlobalSearch";

/**
 * Phone: the wordmark, search, settings and your account; it scrolls away with the page
 * (the tab bar stays). Desktop: a slim bar with player search and your account.
 */
export function TopBar() {
  return (
    <>
      <header className="pt-[var(--safe-top)] lg:hidden">
        <div className="flex h-14 items-center justify-between gap-2 px-4">
          <Link href="/" aria-label="FantasyLab home" className="-ml-1 rounded-lg p-1">
            <Wordmark height={19} />
          </Link>
          <div className="flex items-center gap-0.5">
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
        <AccountButton />
      </header>
    </>
  );
}
