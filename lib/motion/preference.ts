/**
 * Whether animations run in full or reduced. Decided once per page load by a tiny
 * script in <head> (before anything paints) and kept on <html data-motion="full|reduced">:
 * "device" follows the phone's Reduce Motion setting, "full" and "reduced" override it
 * (Settings → Animations). Every animation and the CSS read this one attribute.
 */
export type MotionPreference = "device" | "full" | "reduced";

/** The <head> script. Reads the saved setting directly (no React yet) and never throws. */
export const MOTION_BOOT_SCRIPT = `(function(){try{var p="device";try{var s=JSON.parse(localStorage.getItem("fantasylab:settings")||"null");if(s&&(s.motion==="full"||s.motion==="reduced"))p=s.motion}catch(e){}var r=p==="reduced"||(p==="device"&&matchMedia("(prefers-reduced-motion: reduce)").matches);document.documentElement.setAttribute("data-motion",r?"reduced":"full")}catch(e){}})();`;

/** Update the attribute after the setting changes (or the device setting flips). */
export function applyMotionPreference(preference: MotionPreference) {
  if (typeof document === "undefined") return;
  const reduced =
    preference === "reduced" ||
    (preference === "device" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  document.documentElement.setAttribute("data-motion", reduced ? "reduced" : "full");
}

/** True when animations should be reduced right now. Safe on the server (false). */
export function motionReduced(): boolean {
  if (typeof document === "undefined") return false;
  const mode = document.documentElement.getAttribute("data-motion");
  if (mode) return mode === "reduced";
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
