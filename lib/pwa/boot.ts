/**
 * The installable-app <head> script (runs before React, like MOTION_BOOT_SCRIPT):
 * - marks <html data-standalone> when Xpert runs as an installed app (opened from the
 *   Home Screen, the dock or the app list), so CSS and screens can adapt before anything paints;
 * - marks <html data-native data-standalone> inside the Xpert iPhone/Android app: Capacitor's
 *   bridge says so (Capacitor.isNativePlatform()), or its user agent ends in "XpertApp/1"
 *   (capacitor.config.ts). lib/native/platform.ts reads it;
 * - catches Chrome's/Edge's "this site can be installed" event, which can fire before React
 *   starts, and keeps it for the Install button (components/pwa/install.ts). Holding it also
 *   stops Chrome's own install bar from covering the tab bar on Android.
 */
export const INSTALL_EVENT = "fantasylab:install-change";

export const PWA_BOOT_SCRIPT = `(function(){try{var d=document.documentElement,w=window;var m=["standalone","fullscreen","minimal-ui","window-controls-overlay"].some(function(x){return matchMedia("(display-mode: "+x+")").matches});var c=w.Capacitor,n=!!(c&&c.isNativePlatform&&c.isNativePlatform())||navigator.userAgent.indexOf("XpertApp/")>-1;if(n)d.setAttribute("data-native","");if(m||n||navigator.standalone===true)d.setAttribute("data-standalone","");w.addEventListener("beforeinstallprompt",function(e){e.preventDefault();w.__fantasylabInstall=e;w.dispatchEvent(new Event("${INSTALL_EVENT}"))});w.addEventListener("appinstalled",function(){w.__fantasylabInstall=null;w.__fantasylabInstalled=true;w.dispatchEvent(new Event("${INSTALL_EVENT}"))})}catch(e){}})();`;
