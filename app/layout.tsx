import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import { RosterSync } from "@/components/auth/RosterSync";
import { PlayerProfileHost } from "@/components/player/PlayerProfileHost";
import { PublicTeamsSync } from "@/components/profile/PublicTeamsSync";
import { UserProfileHost } from "@/components/profile/UserProfileHost";
import { LivePulse } from "@/components/live/LivePulse";
import { LeagueSync } from "@/components/teams/LeagueSync";
import { HydrationMarker } from "@/components/motion/hydration";
import { MotionPreferenceSync } from "@/components/motion/MotionPreferenceSync";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { PwaRoot } from "@/components/pwa";
import { BottomBar, BottomBarFrame, BottomBarLinks } from "@/components/shell/BottomBar";
import { Sidebar, SidebarFrame, SidebarNav } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/config";
import { MOTION_BOOT_SCRIPT } from "@/lib/motion/preference";
import { PWA_BOOT_SCRIPT } from "@/lib/pwa/boot";
import { pwaMetadata, pwaViewport } from "@/lib/pwa/metadata";
import "./globals.css";

// One typeface (DECISIONS.md, "Design"): Inter, with tabular figures for numbers.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

// Installable-app head tags (icons, iPhone launch screens, status bar) come from lib/pwa/metadata.ts.
export const metadata: Metadata = {
  ...pwaMetadata,
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: APP_DESCRIPTION,
};

export const viewport: Viewport = { ...pwaViewport };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-motion and data-standalone are set by the head scripts before React starts, hence suppressHydrationWarning.
    <html lang="en" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Decide full or reduced animations before anything paints (lib/motion/preference.ts). */}
        <script dangerouslySetInnerHTML={{ __html: MOTION_BOOT_SCRIPT }} />
        {/* Installed-app mode and the browser's install offer (lib/pwa/boot.ts). */}
        <script dangerouslySetInnerHTML={{ __html: PWA_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <MotionProvider>
          <HydrationMarker />
          <MotionPreferenceSync />
          <a
            href="#main"
            className="sr-only z-50 rounded-full bg-ink px-4 py-2 text-black focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
          >
            Skip to content
          </a>
          <div className="lg:flex">
            <SidebarFrame
              nav={
                // The sidebar reads the URL; Suspense keeps pages with dynamic URLs fast to load.
                <Suspense fallback={<SidebarNav pathname={null} />}>
                  <Sidebar />
                </Suspense>
              }
              footer={null}
            />
            <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
              <TopBar />
              <main
                id="main"
                className="mx-auto w-full max-w-[1120px] flex-1 px-4 pb-[calc(var(--tabbar-height)+max(10px,var(--safe-bottom))+32px)] sm:px-6 lg:px-10 lg:pb-16 has-[[data-chat]]:max-w-[1440px] has-[[data-chat]]:pb-0 lg:has-[[data-chat]]:pb-0"
              >
                {children}
              </main>
            </div>
          </div>
          <BottomBarFrame>
            <Suspense fallback={<BottomBarLinks pathname={null} />}>
              <BottomBar />
            </Suspense>
          </BottomBarFrame>
          {/* The one player profile, over any screen (?player=<id>). Reads the URL, hence Suspense. */}
          <Suspense fallback={null}>
            <PlayerProfileHost />
          </Suspense>
          {/* A person's public profile, over any screen (?user=<username>, from chat). */}
          <Suspense fallback={null}>
            <UserProfileHost />
          </Suspense>
          {/* Keeps the teams you made public up to date as they change on this device. */}
          <PublicTeamsSync />
          {/* One shared "is anything live?" scoreboard poll that paces every other live poll. */}
          <LivePulse />
          {/* Keeps the active ESPN team's roster and record current from its league. */}
          <LeagueSync />
          {/* Keeps your team saved to your account while you're signed in (mounted once). */}
          <RosterSync />
          {/* Service worker, "Update ready" prompt and offline indicator. */}
          <PwaRoot />
        </MotionProvider>
      </body>
    </html>
  );
}
