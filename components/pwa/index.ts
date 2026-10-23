/**
 * Installable-app ("PWA") pieces for the browser. Mount <PwaRoot /> once in app/layout.tsx;
 * the parts are exported separately for custom placement. The service worker is public/sw.js;
 * head tags are in lib/pwa/metadata.ts; the manifest is app/manifest.ts.
 */
export { PwaRoot } from "./PwaRoot";
export { UpdatePrompt } from "./UpdatePrompt";
export { OfflineIndicator } from "./OfflineIndicator";
export { usePwaUpdate, useIsOffline } from "./hooks";
export { InstallCard, InstallSetting, installHint } from "./InstallCard";
export { InstallSheet } from "./InstallSheet";
export { BringYourTeam } from "./BringYourTeam";
export { useInstallRoute, isStandalone, promptInstall } from "./install";
export type { InstallRoute } from "./install";
export { appBuildTime, checkForUpdate } from "./service-worker";
