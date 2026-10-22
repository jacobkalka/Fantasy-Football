import Link from "next/link";
import { APP_NAME } from "@/lib/config";

export function AppHeader() {
  return (
    <header className="flex items-center justify-between px-4 pt-4 pb-3">
      <Link href="/" className="flex items-center gap-2">
        <span className="size-3 bg-gain" aria-hidden="true" />
        <span className="font-display text-2xl font-bold tracking-[0.06em] uppercase">
          {APP_NAME}
        </span>
      </Link>
    </header>
  );
}
