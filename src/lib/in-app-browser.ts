// Tells in-app browsers (LINE, Instagram, …) apart by User-Agent (F15). Google refuses to sign in
// from embedded browsers (disallowed_useragent), so /login sends these people to Safari / Chrome.
// Pure so it can run on the server (request headers) and in tests.

export type InAppBrowser = {
  /** The app's name for the message, or null for an Android WebView we can't name. */
  app: string | null;
  android: boolean;
};

const APPS: { name: string; pattern: RegExp }[] = [
  { name: "LINE", pattern: /\bLine\//i },
  { name: "Instagram", pattern: /\bInstagram\b/ },
  { name: "Facebook", pattern: /\bFB(?:AN|AV|_IAB|IOS)\b/ },
  { name: "X", pattern: /\bTwitter\b/ },
  { name: "TikTok", pattern: /\b(?:musical_ly|BytedanceWebview|TikTok)\b/ },
];

/**
 * Null for a normal browser. Deliberately doesn't treat every iOS user agent without "Safari/" as
 * embedded: the home-screen app (PWA) on iOS also leaves it out, and it must be able to sign in.
 */
export function detectInAppBrowser(userAgent: string | null | undefined): InAppBrowser | null {
  if (!userAgent) return null;
  const android = /\bAndroid\b/.test(userAgent);
  const app = APPS.find(({ pattern }) => pattern.test(userAgent));
  if (app) return { app: app.name, android };
  // Android WebViews mark themselves with "; wv)". Chrome Custom Tabs don't, and can sign in.
  if (android && /;\s*wv\)/.test(userAgent)) return { app: null, android };
  return null;
}

/** Opens the same URL in Chrome on Android (an in-app browser can't open Safari / Chrome itself). */
export function chromeIntentUrl(url: string): string {
  const { host, pathname, search, protocol } = new URL(url);
  return `intent://${host}${pathname}${search}#Intent;scheme=${protocol.replace(":", "")};package=com.android.chrome;end`;
}
