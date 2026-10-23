import type { Metadata } from "next";
import { Suspense } from "react";
import { ChatHome } from "@/components/chat/ChatHome";
import { Screen } from "@/components/motion/Screen";
import { PageTitle, Skeleton } from "@/components/ui/bits";

export const metadata: Metadata = { title: "Chat" };

export default function ChatPage() {
  return (
    <Screen>
      <PageTitle kicker="Talk it out, live">Chat</PageTitle>
      {/* ChatHome reads ?tab= from the URL, which needs a Suspense boundary. */}
      <Suspense fallback={<Skeleton className="h-64 rounded-3xl" />}>
        <ChatHome />
      </Suspense>
    </Screen>
  );
}
