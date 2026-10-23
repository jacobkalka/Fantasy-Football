import { APP_NAME } from "@/lib/config";

/** The FantasyLab wordmark (the owner's logo, traced to vector). Width follows from the height. */
export function Wordmark({ height = 22, className = "" }: { height?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/wordmark-white.svg"
      alt={APP_NAME}
      width={Math.round((height * 1049) / 203)}
      height={height}
      className={`block select-none ${className}`}
      draggable={false}
    />
  );
}

/** The flask-F mark on its own. */
export function Mark({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/mark.svg"
      alt=""
      aria-hidden="true"
      width={Math.round((size * 374) / 355)}
      height={size}
      className={`block select-none ${className}`}
      draggable={false}
    />
  );
}
