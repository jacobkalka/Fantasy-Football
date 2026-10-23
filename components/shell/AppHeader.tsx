import Link from "next/link";
import { AccountButton } from "@/components/auth/AccountButton";
import { APP_NAME } from "@/lib/config";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-40 px-3 pt-[max(env(safe-area-inset-top),0.75rem)] pb-2">
      <div className="glass-bar flex h-12 items-center justify-between rounded-2xl pr-1.5 pl-4">
        <Link href="/" transitionTypes={["nav-back"]} className="flex items-center gap-2.5">
          <span
            className="size-3 rounded-[3px] bg-gain shadow-[0_0_12px_rgb(200_255_46/0.8)]"
            aria-hidden="true"
          />
          <span className="font-display text-[22px] leading-none font-bold tracking-[0.08em] uppercase">
            {APP_NAME}
          </span>
        </Link>
        {/* Sign in, or your account. Also keeps your team saved to your account while signed in. */}
        <AccountButton />
      </div>
    </header>
  );
}
