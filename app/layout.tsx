import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import { RosterSync } from "@/components/auth/RosterSync";
import { HydrationMarker } from "@/components/motion/hydration";
import { MotionPreferenceSync } from "@/components/motion/MotionPreferenceSync";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { PwaRoot } from "@/components/pwa";
import { BottomBar, BottomBarFrame, BottomBarLinks } from "@/components/shell/BottomBar";
import { Sidebar, SidebarFrame, SidebarNav } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/config";
import { MOTION_BOOT_SCRIPT } from "@/lib/motion/preference";
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
    // data-motion is set by the head script before React starts, hence suppressHydrationWarning.
    <html lang="en" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Decide full or reduced animations before anything paints (lib/motion/preference.ts). */}
        <script dangerouslySetInnerHTML={{ __html: MOTION_BOOT_SCRIPT }} />
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
                className="mx-auto w-full max-w-[1120px] flex-1 px-4 pb-[calc(var(--tabbar-height)+max(10px,var(--safe-bottom))+32px)] sm:px-6 lg:px-10 lg:pb-16"
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
          {/* Keeps your team saved to your account while you're signed in (mounted once). */}
          <RosterSync />
          {/* Service worker, "Update ready" prompt and offline indicator. */}
          <PwaRoot />
        </MotionProvider>
      </body>
    </html>
  );
}
