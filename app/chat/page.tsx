import type { Metadata } from "next";
import { Suspense } from "react";
import { ChatShell } from "@/components/chat/ChatShell";
import { Skeleton } from "@/components/ui/bits";

export const metadata: Metadata = { title: "Chat" };

export default function ChatPage() {
  return (
    // The shell reads ?thread= from the URL, which needs a Suspense boundary.
    <Suspense fallback={<Skeleton className="mt-6 h-[60dvh] rounded-[20px]" />}>
      <ChatShell roomKey={null} />
    </Suspense>
  );
}
