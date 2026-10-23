/**
 * Starts the worker. Node can't run TypeScript with "@/..." imports on its own,
 * so this switches on tsx (using worker/tsconfig.json), then runs src/main.ts.
 *
 * Works from any folder, with no npm in between (so Railway's stop signal
 * reaches the worker directly and it can shut down cleanly):
 *   node worker/start.mjs            from the project folder (Railway)
 *   node start.mjs replay 401872996  from inside worker/
 */
import { fileURLToPath } from "node:url";
import { register as registerCommonJs } from "tsx/cjs/api";
import { register as registerModules } from "tsx/esm/api";

const tsconfig = fileURLToPath(new URL("./tsconfig.json", import.meta.url));
process.env.TSX_TSCONFIG_PATH = tsconfig;
// The shared code in ../lib is loaded as CommonJS (the app's package.json), the worker as ES modules.
registerCommonJs();
registerModules({ tsconfig });

await import("./src/main.ts");
