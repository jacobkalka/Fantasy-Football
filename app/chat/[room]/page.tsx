import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RoomScreen } from "@/components/chat/RoomScreen";
import { Screen } from "@/components/motion/Screen";
import { Skeleton } from "@/components/ui/bits";
import { parseRoomKey } from "@/lib/chat/rooms";

export const metadata: Metadata = { title: "Chat room" };

/** Reads the room from the URL. Unknown rooms get the 404 page. */
async function Room({ params }: { params: Promise<{ room: string }> }) {
  const { room } = await params;
  if (!parseRoomKey(room)) notFound();
  return <RoomScreen roomKey={room} />;
}

export default function ChatRoomPage({ params }: PageProps<"/chat/[room]">) {
  return (
    <Screen>
      {/* The room name comes from the URL, only known at request time, so it streams in. */}
      <Suspense fallback={<Skeleton className="h-72 rounded-3xl" />}>
        <Room params={params} />
      </Suspense>
    </Screen>
  );
}
