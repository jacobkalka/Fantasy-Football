import type { Metadata } from "next";
import { ComingUp } from "@/components/ui/ComingUp";

export const metadata: Metadata = { title: "Chat" };

export default function ChatPage() {
  return (
    <ComingUp title="Chat" phase={8}>
      <p>
        A global room, a room for every NFL game, and a private room for your league. Share a
        play from the feed straight into the conversation.
      </p>
    </ComingUp>
  );
}
