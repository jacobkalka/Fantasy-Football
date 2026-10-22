"use client";

import { useEffect, useState } from "react";

/** The current time, updated every `everyMs`. Starts at 0 until the page is in the browser. */
export function useNow(everyMs = 1000) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const id = setInterval(update, everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}
