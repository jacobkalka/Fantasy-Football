import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Inter, JetBrains_Mono } from "next/font/google";
import { Suspense } from "react";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { AppHeader } from "@/components/shell/AppHeader";
import { TabBar, TabBarLinks } from "@/components/shell/TabBar";
import { Ambient } from "@/components/ui/Ambient";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/config";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

const barlow = Barlow_Condensed({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#04060a",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${barlow.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <MotionProvider>
          <Ambient />
          <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col">
            <AppHeader />
            <main className="flex-1 px-3 pt-1 pb-32">{children}</main>
          </div>
          <nav
            aria-label="Main"
            className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]"
          >
            <div className="mx-auto max-w-md">
              {/* The tab bar reads the URL; Suspense keeps pages with dynamic URLs fast to load. */}
              <Suspense fallback={<TabBarLinks pathname={null} />}>
                <TabBar />
              </Suspense>
            </div>
          </nav>
        </MotionProvider>
      </body>
    </html>
  );
}
