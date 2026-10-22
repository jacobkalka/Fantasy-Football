import type { TabIcon as TabIconName } from "@/lib/config";

const PATHS: Record<TabIconName, React.ReactNode> = {
  team: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 12h18M12 3v18" />
    </>
  ),
  feed: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  games: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M12 5v14M3 12h3M18 12h3" />
    </>
  ),
  startSit: <path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4" />,
  chat: <path d="M4 5h16v11H9l-5 4z" />,
};

export function TabIcon({ name }: { name: TabIconName }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
