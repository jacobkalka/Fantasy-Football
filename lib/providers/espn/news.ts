import type { Injury, NewsArticle, NewsItem } from "@/lib/providers/types";
import { arr, get, num, obj, str, type Json } from "./json";

export function parseNews(raw: Json): NewsItem[] {
  return arr(get(raw, "articles"))
    .map(obj)
    .map((a) => ({
      id: str(a.id) || str(a.nowId) || str(a.headline),
      headline: str(a.headline),
      description: str(a.description),
      published: str(a.published) || str(a.lastModified),
      link: str(get(a, "links", "web", "href")) || undefined,
      playerIds: arr(a.categories)
        .map(obj)
        .filter((c) => str(c.type) === "athlete" && c.athleteId !== undefined)
        .map((c) => String(num(c.athleteId))),
    }))
    .filter((n) => n.headline);
}

function stripHtml(html: string) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * ESPN's fantasy news feed for one player. (The general news endpoint ignores its
 * `athlete` filter, so it can't be used for per-player news.) "Rotowire" items are
 * short player updates; their `story` is the useful part.
 */
export function parsePlayerNews(raw: Json, playerId: string): NewsItem[] {
  return arr(get(raw, "feed"))
    .map(obj)
    .map((a) => {
      const rotowire = str(a.type) === "Rotowire";
      return {
        id: str(a.id) || str(a.nowId) || str(a.headline),
        headline: str(a.headline),
        description: rotowire ? stripHtml(str(a.story)) || str(a.description) : str(a.description),
        published: str(a.published) || str(a.lastModified),
        link: str(get(a, "links", "web", "href")) || undefined,
        playerIds: [playerId],
      };
    })
    .filter((n) => n.headline);
}

/** The league-wide injury report. Athlete ids only appear inside their profile links. */
export function parseInjuries(raw: Json): Injury[] {
  const injuries: Injury[] = [];
  for (const team of arr(get(raw, "injuries")).map(obj)) {
    const teamId = str(team.id);
    for (const item of arr(team.injuries).map(obj)) {
      const href = arr(get(item, "athlete", "links"))
        .map((l) => str(get(l, "href")))
        .find((h) => /\/id\/\d+/.test(h));
      const playerId = href?.match(/\/id\/(\d+)/)?.[1];
      if (!playerId) continue;
      injuries.push({
        playerId,
        teamId,
        status: str(item.status),
        shortComment: str(item.shortComment),
        longComment: str(item.longComment) || undefined,
        date: str(item.date),
      });
    }
  }
  return injuries;
}

// ── Rich articles for the News screen ─────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  HeadlineNews: "News",
  Story: "Story",
  Media: "Video",
  Preview: "Preview",
  Recap: "Recap",
  Rotowire: "Player update",
};

/** Injury-flavoured stories get their own label so they stand out (words from the headline only). */
function category(type: string, headline: string) {
  if (/\b(injur|out for|ruled out|questionable|doubtful|IR\b|sprain|strain|torn|concussion|day-to-day)/i.test(headline)) {
    return "Injury";
  }
  if (/\b(fantasy|start|sit|waiver|sleeper|rankings?)\b/i.test(headline)) return "Fantasy";
  if (/\b(trade|traded|acquire|deal|signs?|released|waived)\b/i.test(headline)) return "Transaction";
  return TYPE_LABEL[type] ?? "News";
}

function headerImage(a: Record<string, Json>): string | null {
  const images = arr(a.images).map(obj);
  const pick = images.find((i) => str(i.type) === "header") ?? images[0];
  const url = str(pick?.url);
  return /^https:\/\/a\.espncdn\.com\//.test(url) ? url : null;
}

function ids(a: Record<string, Json>, type: "athlete" | "team", field: "athleteId" | "teamId") {
  return [
    ...new Set(
      arr(a.categories)
        .map(obj)
        .filter((c) => str(c.type) === type && c[field] !== undefined)
        .map((c) => String(num(c[field]))),
    ),
  ];
}

/** ESPN's NFL news feed as article cards. Only headline, summary, image and link: reading happens on ESPN. */
export function parseArticles(raw: Json): NewsArticle[] {
  return arr(get(raw, "articles"))
    .map(obj)
    .map((a) => {
      const headline = str(a.headline);
      return {
        id: str(a.id) || str(a.nowId) || headline,
        headline,
        description: str(a.description),
        published: str(a.published) || str(a.lastModified),
        link: /^https:\/\/(www\.)?espn\.com\//.test(str(get(a, "links", "web", "href"))) ? str(get(a, "links", "web", "href")) : null,
        image: headerImage(a),
        category: category(str(a.type), headline),
        source: str(a.byline) || "ESPN",
        playerIds: ids(a, "athlete", "athleteId"),
        playerNames: Object.fromEntries(
          arr(a.categories)
            .map(obj)
            .filter((c) => str(c.type) === "athlete" && c.athleteId !== undefined && str(c.description))
            .map((c) => [String(num(c.athleteId)), str(c.description)]),
        ),
        teamIds: ids(a, "team", "teamId"),
        premium: a.premium === true,
      };
    })
    .filter((n) => n.headline);
}

/**
 * ESPN's fantasy news for one player as article cards. "Rotowire" items are short player
 * updates ESPN publishes on its player pages: shown as a short note with credit, linking to
 * the player's ESPN page (the update itself has no article link).
 */
export function parsePlayerArticles(raw: Json, playerId: string): NewsArticle[] {
  return arr(get(raw, "feed"))
    .map(obj)
    .map((a) => {
      const type = str(a.type);
      const rotowire = type === "Rotowire";
      const headline = str(a.headline);
      const href = str(get(a, "links", "web", "href"));
      return {
        id: str(a.id) || str(a.nowId) || headline,
        headline,
        description: rotowire ? stripHtml(str(a.story)).slice(0, 600) || str(a.description) : str(a.description),
        published: str(a.published) || str(a.lastModified),
        link: /^https:\/\/(www\.)?espn\.com\//.test(href)
          ? href
          : playerId.startsWith("-")
            ? null
            : `https://www.espn.com/nfl/player/_/id/${playerId}`,
        image: headerImage(a),
        category: rotowire ? "Player update" : category(type, headline),
        source: rotowire ? "RotoWire via ESPN" : str(a.byline) || "ESPN Fantasy",
        playerIds: [playerId],
        playerNames: {},
        teamIds: [],
        premium: a.premium === true,
      };
    })
    .filter((n) => n.headline);
}
