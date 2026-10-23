import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInForm } from "@/components/auth/SignInForm";
import { Screen } from "@/components/motion/Screen";
import { PageTitle, Skeleton } from "@/components/ui/bits";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <Screen>
      <PageTitle kicker="Your account">Sign in</PageTitle>
      {/* The form reads ?next= and ?error= from the URL, which needs a Suspense boundary. */}
      <Suspense fallback={<Skeleton className="h-72 rounded-3xl" />}>
        <SignInForm />
      </Suspense>
    </Screen>
  );
}
