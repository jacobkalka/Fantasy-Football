/**
 * One outline icon set: 24px grid, 1.6px strokes, round joins, coloured by the text
 * colour. Decorative by default (hidden from screen readers); give the button around it
 * an accessible name.
 */
const PATHS = {
  home: "M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z",
  team: "M12 3.5 5 6v5.5c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6z M9 11.5l2 2 4-4",
  players: "M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z M3.5 20c.6-3.4 3.2-5.5 6.5-5.5 1.4 0 2.6.4 3.6 1 M17.5 20a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5Z M19.5 19l1.8 1.8",
  trades: "M7 4 3.5 7.5 7 11 M3.5 7.5H17 M17 13l3.5 3.5L17 20 M20.5 16.5H7",
  live: "M12 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z M8.5 8.5a5 5 0 0 0 0 7 M15.5 8.5a5 5 0 0 1 0 7 M5.6 5.6a9 9 0 0 0 0 12.8 M18.4 5.6a9 9 0 0 1 0 12.8",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z m5-2 4 4",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.6-2-3.4-2.4.9a7.5 7.5 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.4a7.5 7.5 0 0 0-2.6 1.5l-2.4-.9-2 3.4 2 1.6a7.6 7.6 0 0 0 0 3l-2 1.6 2 3.4 2.4-.9a7.5 7.5 0 0 0 2.6 1.5l.4 2.4h4l.4-2.4a7.5 7.5 0 0 0 2.6-1.5l2.4.9 2-3.4z",
  close: "M6 6l12 12 M18 6 6 18",
  plus: "M12 5v14 M5 12h14",
  minus: "M5 12h14",
  check: "M5 12.5 9.5 17 19 7",
  chevronRight: "m9 5 7 7-7 7",
  chevronLeft: "m15 5-7 7 7 7",
  chevronDown: "m5 9 7 7 7-7",
  arrowUp: "M12 19V5 M6 11l6-6 6 6",
  arrowDown: "M12 5v14 M6 13l6 6 6-6",
  arrowRight: "M5 12h14 M13 6l6 6-6 6",
  swap: "M7 7h13 M16 3l4 4-4 4 M17 17H4 M8 13l-4 4 4 4",
  star: "m12 3.8 2.5 5.1 5.6.8-4 3.9 1 5.6L12 16.6l-5.1 2.6 1-5.6-4-3.9 5.6-.8z",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 11v5 M12 7.5v.5",
  alert: "M12 4 2.8 19.5h18.4z M12 10v4 M12 16.8v.4",
  refresh: "M20 11a8 8 0 1 0-2.3 5.7 M20 4.5V11h-6.5",
  edit: "M4 20h4L19 9l-4-4L4 16z M13.5 6.5l4 4",
  trash: "M4.5 7h15 M9.5 7V4.5h5V7 M6.5 7l1 13h9l1-13",
  list: "M8 6h12 M8 12h12 M8 18h12 M4 6h.01 M4 12h.01 M4 18h.01",
  field: "M4 4h16v16H4z M4 12h16 M12 4v16",
  chat: "M4 5h16v11H9l-5 4z",
  external: "M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6",
  filter: "M4 6h16 M7 12h10 M10 18h4",
  share: "M12 15V4 M7.5 8.5 12 4l4.5 4.5 M5 13v7h14v-7",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M4.5 20.5c.8-3.8 3.8-6 7.5-6s6.7 2.2 7.5 6",
  bolt: "M13 3 5 13.5h6L10.5 21 19 10h-6z",
  wifiOff: "M3 3l18 18 M8.5 16.5a5 5 0 0 1 7 0 M5 12.7a10 10 0 0 1 4.3-2.5 M19 12.7a10 10 0 0 0-2.4-1.7 M2 9.3a15 15 0 0 1 4.5-2.8 M22 9.3A15 15 0 0 0 12 5.5c-.7 0-1.4 0-2 .1 M12 20h.01",
  menu: "M4 7h16 M4 12h16 M4 17h16",
  calculator: "M6 3h12v18H6z M9 7h6 M9 11h.01 M12 11h.01 M15 11h.01 M9 14.5h.01 M12 14.5h.01 M15 14.5v3.5 M9 18h.01 M12 18h.01",
  trend: "M3.5 17 9 11.5l3.5 3.5L20 7.5 M14.5 7.5H20V13",
  /** iPhone's "Add to Home Screen": a rounded square with a plus. */
  addSquare: "M7 4h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z M12 8.5v7 M8.5 12h7",
  more: "M5.5 12h.01 M12 12h.01 M18.5 12h.01",
  moreVertical: "M12 5.5v.01 M12 12v.01 M12 18.5v.01",
  download: "M12 4v11 M7.5 10.5 12 15l4.5-4.5 M5 19.5h14",
  copy: "M9 9h10v11H9z M15 9V4H5v11h4",
  phone: "M8 3h8a1.5 1.5 0 0 1 1.5 1.5v15A1.5 1.5 0 0 1 16 21H8a1.5 1.5 0 0 1-1.5-1.5v-15A1.5 1.5 0 0 1 8 3Z M11 18h2",
  compass: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z m3.5-12.5-2 5-5 2 2-5z",
  news: "M5 4h11v16H6a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1Z M16 8h3a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2h-2 M8 8h5 M8 12h5 M8 16h3",
  versus: "M4 5l4 9 4-9 M20 6.5c-.6-1-1.6-1.5-2.8-1.5-1.6 0-2.7.9-2.7 2.2 0 3 5.8 1.8 5.8 5 0 1.4-1.2 2.3-2.9 2.3-1.3 0-2.4-.6-3-1.6 M4 19h16",
  football: "M5.5 18.5c-2-2-2.2-7.4 1.8-11.4s9.4-3.8 11.4-1.8 2.2 7.4-1.8 11.4-9.4 3.8-11.4 1.8Z M9.5 14.5l5-5 M10 11l3 3 M11.5 9.5l3 3",
  hash: "M9 4 7 20 M17 4l-2 16 M4.5 9h16 M3.5 15h16",
  reply: "M9 14 4 9l5-5 M4 9h10a6 6 0 0 1 6 6v5",
  thread: "M5 5h14v9H11l-4 3.5V14H5z M9 9h6",
  heart: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z",
  smile: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M8.5 14.5a4.5 4.5 0 0 0 7 0 M9 9.5h.01 M15 9.5h.01",
  poll: "M5 20V11 M12 20V4 M19 20v-6",
  eye: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  eyeOff: "M3 3l18 18 M10.6 5.6A9.6 9.6 0 0 1 12 5.5C18 5.5 21.5 12 21.5 12a17 17 0 0 1-3 3.8 M6.4 6.5A16.6 16.6 0 0 0 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1 M9.9 10a2.5 2.5 0 0 0 3.5 3.6",
  lock: "M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M3.5 12h17 M12 3c2.5 2.6 3.5 5.6 3.5 9s-1 6.4-3.5 9c-2.5-2.6-3.5-5.6-3.5-9s1-6.4 3.5-9Z",
  shield: "M12 3.5 5 6v5.5c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6z",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  crown: "M4 8l4 4 4-7 4 7 4-4-1.5 10h-13z",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Z M12 12.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1Z",
  flame: "M12 21c3.6 0 6-2.5 6-6 0-4.5-4-6.5-4.5-10.5C10 7 9 9.5 9.5 12 8 11.3 7.3 10 7.2 8.6 5.9 10.2 6 12.4 6 15c0 3.5 2.4 6 6 6Z",
  at: "M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1",
  send: "M4 12 20 4l-5 16-3-7z M12 13 20 4",
  bell: "M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z M10 20.5a2 2 0 0 0 4 0",
  chart: "M4 4v16h16 M7.5 15l3.5-4 3 2.5 5-6",
  rank: "M9 6h11 M9 12h11 M9 18h11 M4.5 5v3 M4 13.5c0-1 .6-1.5 1.2-1.5s1.1.4 1.1 1c0 1-2.3 2-2.3 3h2.4 M4 18.5h1.3a.8.8 0 0 1 0 1.5H4",
  ball: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
  pulse: "M3 12h4l2.5-6 5 12 2.5-6h4",
  heal: "M9 4h6v5h5v6h-5v5H9v-5H4V9h5z",
  mute: "M4 9h4l5-4v14l-5-4H4z M17 9l4 6 M21 9l-4 6",
  flag: "M5 21V4 M5 4h11l-2 4 2 4H5",
  image: "M4 5h16v14H4z M4 15l4.5-4.5 4 4 2.5-2.5L20 17 M15.5 9.5h.01",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 20,
  className = "",
  strokeWidth = 1.6,
  title,
}: {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
  /** Only when the icon stands alone and means something (otherwise label the button). */
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title && <title>{title}</title>}
      <path d={PATHS[name]} />
    </svg>
  );
}
