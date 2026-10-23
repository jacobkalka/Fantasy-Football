import type { Metadata } from "next";
import { Suspense } from "react";
import { ChatHome } from "@/components/chat/ChatHome";
import { Screen } from "@/components/motion/Screen";
import { SectionTabs } from "@/components/shell/SectionTabs";
import { PageTitle, Skeleton } from "@/components/ui/bits";

export const metadata: Metadata = { title: "Chat" };

export default function ChatPage() {
  return (
    <Screen>
      <div>
        <SectionTabs section="/feed" current="/chat" />
        <PageTitle sub="Talk it out with other fans, game by game">Chat</PageTitle>
      </div>
      {/* ChatHome reads ?tab= from the URL, which needs a Suspense boundary. */}
      <Suspense fallback={<Skeleton className="h-64 rounded-3xl" />}>
        <ChatHome />
      </Suspense>
    </Screen>
  );
}
