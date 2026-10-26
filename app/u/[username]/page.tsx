import type { Metadata } from "next";
import { Suspense } from "react";
import { UserProfile } from "@/components/profile/UserProfile";
import { Skeleton } from "@/components/ui/bits";

export const metadata: Metadata = { title: "Profile" };

/** Reads the username from the URL (request-time data), so it renders inside Suspense. */
async function Profile({ params }: { params: PageProps<"/u/[username]">["params"] }) {
  const { username } = await params;
  const name = decodeURIComponent(username).toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(name)) return <p className="card p-5 text-[15px]">That isn&apos;t a FantasyLab username.</p>;
  return <UserProfile username={name} />;
}

/** A person's public profile as its own page (shared links). In the app, tapping a name opens it over the screen. */
export default function UserPage(props: PageProps<"/u/[username]">) {
  return (
    <div className="mx-auto w-full max-w-[760px] pt-4 lg:pt-8">
      <Suspense fallback={<Skeleton className="h-64 rounded-[20px]" />}>
        <Profile params={props.params} />
      </Suspense>
    </div>
  );
}
