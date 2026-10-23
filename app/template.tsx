import { PageEnter } from "@/components/motion/PageEnter";

/** Re-created on every navigation (unlike the layout), so each screen can arrive. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <PageEnter>{children}</PageEnter>;
}
