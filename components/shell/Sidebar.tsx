"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { activeChild, NAV, sectionFor } from "@/lib/config";
import { Wordmark } from "./Brand";

/**
 * Desktop navigation (1024px and wider): the wordmark, the five sections, and the
 * sub-pages of the section you're in. The active item is marked by its label going
 * from grey to white; the sidebar sits on the page ground with one hairline.
 */
export function SidebarNav({ pathname }: { pathname: string | null }) {
  const section = sectionFor(pathname);
  const child = activeChild(section, pathname);
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {NAV.map((item) => {
        const active = section?.href === item.href;
        return (
          <div key={item.href}>
            <Link
              href={item.href}
              aria-current={active && (!item.children || child?.href === item.href) ? "page" : undefined}
              className={`flex h-9 items-center gap-3 rounded-lg px-3 text-[14px] transition-colors hover:bg-raised ${
                active ? "font-medium text-ink" : "text-[#bbbbbb] hover:text-ink"
              }`}
            >
              <Icon name={item.icon} size={18} />
              {item.label}
            </Link>
            {active && item.children && (
              <div className="mt-0.5 mb-2 flex flex-col">
                {item.children.map((sub) => {
                  const on = child?.href === sub.href;
                  return (
                    <Link
                      key={sub.href}
                      href={sub.href}
                      aria-current={on ? "page" : undefined}
                      className={`flex h-8 items-center rounded-lg pr-3 pl-[42px] text-[13px] transition-colors hover:bg-raised ${
                        on ? "text-ink" : "text-faint hover:text-ink"
                      }`}
                    >
                      {sub.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  return <SidebarNav pathname={pathname} />;
}

/** The parts of the sidebar that don't depend on the URL. */
export function SidebarFrame({ nav, footer }: { nav: React.ReactNode; footer: React.ReactNode }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col border-r border-line px-3 pt-6 pb-4 lg:flex">
      <Link href="/" className="mb-7 block rounded-lg px-3 py-1" aria-label="Xpert home">
        <Wordmark height={21} />
      </Link>
      <div className="min-h-0 flex-1 overflow-y-auto">{nav}</div>
      <div className="flex flex-col gap-0.5 pt-4">
        <Link
          href="/settings"
          className="flex h-9 items-center gap-3 rounded-lg px-3 text-[14px] text-[#bbbbbb] transition-colors hover:bg-raised hover:text-ink"
        >
          <Icon name="settings" size={18} />
          Settings
        </Link>
        {footer}
      </div>
    </aside>
  );
}
