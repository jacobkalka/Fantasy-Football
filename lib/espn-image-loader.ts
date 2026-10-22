"use client";

/**
 * Every <Image> goes through here. ESPN's CDN can resize images itself
 * (a 230 KB headshot becomes ~7 KB), so we ask it for the size we need
 * instead of downloading the full file.
 */
export default function espnImageLoader({
  src,
  width,
  quality,
}: {
  src: string;
  width: number;
  quality?: number;
}) {
  const prefix = "https://a.espncdn.com/";
  if (!src.startsWith(prefix) || src.includes("/combiner/")) return src;
  const path = src.slice(prefix.length - 1);
  const params = new URLSearchParams({
    img: path,
    w: String(width),
    cquality: String(quality ?? 70),
  });
  return `${prefix}combiner/i?${params.toString()}`;
}
