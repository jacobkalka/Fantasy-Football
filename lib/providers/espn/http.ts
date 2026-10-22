/** Fetching from ESPN with a timeout and one retry, so a slow response never hangs a page. */

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export const ESPN = {
  site: "https://site.api.espn.com/apis/site/v2/sports/football/nfl",
  siteWeb: "https://site.web.api.espn.com/apis/common/v3/sports/football/nfl",
  core: "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl",
  fantasy: "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl",
  fantasyNews: "https://site.api.espn.com/apis/fantasy/v2/games/ffl/news",
  cdn: "https://a.espncdn.com",
} as const;

export async function espnJson(
  url: string,
  { headers, timeoutMs = 8000 }: { headers?: Record<string, string>; timeoutMs?: number } = {},
): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { accept: "application/json", ...headers },
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
      if (!response.ok) {
        // 4xx won't get better by retrying.
        if (response.status < 500) {
          throw new ProviderError(`ESPN responded ${response.status}`, response.status);
        }
        lastError = new ProviderError(`ESPN responded ${response.status}`, response.status);
        continue;
      }
      return await response.json();
    } catch (error) {
      if (error instanceof ProviderError && error.status && error.status < 500) throw error;
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new ProviderError("ESPN request failed");
}
