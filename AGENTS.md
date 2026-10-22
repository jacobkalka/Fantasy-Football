<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## This project

A live fantasy football tracker built in phases for an owner with no coding experience.

- Read `DECISIONS.md` first and log every new decision there with its reason.
- Explain changes in plain language; tell the owner exactly what to click to see them.
- Look before you build: before code depends on an ESPN endpoint, fetch it, save the response under
  `samples/`, and build against what actually came back. Never invent ESPN responses.
- App code never talks to ESPN directly, only through the provider interface in `lib/providers/`.
- Secrets live in `.env.local` / hosting settings only. Every variable name goes in `.env.example`
  with no value.
- Colors and fonts are tokens in `app/globals.css`; don't hard-code hex values in components.
- Keep the app working after every phase: `npm run lint`, `npm test`, `npm run build`, and
  `bash scripts/test-db.sh` (database rules) must pass before committing.
