import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChatShell } from "@/components/chat/ChatShell";
import { Skeleton } from "@/components/ui/bits";
import { parseRoomKey } from "@/lib/chat/rooms";

export const metadata: Metadata = { title: "Chat room" };

/** Reads the room from the URL. Unknown rooms get the 404 page. */
async function Room({ params }: { params: Promise<{ room: string }> }) {
  const { room } = await params;
  if (!parseRoomKey(room)) notFound();
  return <ChatShell roomKey={room} />;
}

export default function ChatRoomPage({ params }: PageProps<"/chat/[room]">) {
  return (
    // The room comes from the URL, only known at request time, so it streams in.
    <Suspense fallback={<Skeleton className="mt-6 h-[60dvh] rounded-[20px]" />}>
      <Room params={params} />
    </Suspense>
  );
}
