import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Inter, JetBrains_Mono } from "next/font/google";
import { Suspense } from "react";
import { AppHeader } from "@/components/shell/AppHeader";
import { TabBar, TabBarLinks } from "@/components/shell/TabBar";
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
};

export const viewport: Viewport = {
  themeColor: "#07090b",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${barlow.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col">
          <AppHeader />
          <main className="flex-1 px-4 pb-28">{children}</main>
        </div>
        <nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 border-t border-line bg-raised/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
        >
          <div className="mx-auto max-w-xl">
            {/* The tab bar reads the URL; Suspense keeps pages with dynamic URLs fast to load. */}
            <Suspense fallback={<TabBarLinks pathname={null} />}>
              <TabBar />
            </Suspense>
          </div>
        </nav>
      </body>
    </html>
  );
}
