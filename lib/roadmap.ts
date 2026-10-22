/** Build progress shown on the home screen. Update a phase's status when it ships. */
export type PhaseStatus = "done" | "building" | "next" | "later";

export const ROADMAP: { phase: number; title: string; status: PhaseStatus }[] = [
  { phase: 0, title: "Setup and first deploy", status: "building" },
  { phase: 1, title: "Live scoreboard", status: "next" },
  { phase: 2, title: "Play-by-play and Game Center", status: "later" },
  { phase: 3, title: "Real-time updates and replay mode", status: "later" },
  { phase: 4, title: "Accounts and your roster", status: "later" },
  { phase: 5, title: "Live fantasy points per play", status: "later" },
  { phase: 6, title: "Injuries, news, projections", status: "later" },
  { phase: 7, title: "Start/Sit advisor", status: "later" },
  { phase: 8, title: "Chat rooms", status: "later" },
  { phase: 9, title: "Import your ESPN league", status: "later" },
  { phase: 10, title: "Polish and install on your phone", status: "later" },
];

export const STATUS_LABEL: Record<PhaseStatus, string> = {
  done: "Done",
  building: "Building",
  next: "Up next",
  later: "Later",
};
