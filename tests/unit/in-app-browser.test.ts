import { describe, expect, it } from "vitest";
import { chromeIntentUrl, detectInAppBrowser } from "@/lib/in-app-browser";

const UA = {
  lineIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.10.0",
  lineAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240805.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.6613.88 Mobile Safari/537.36 Line/14.12.1/IAB",
  instagramIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 340.0.2.16.109 (iPhone15,2; iOS 17_5; ja_JP; ja; scale=3.00; 1179x2556; 623512017)",
  facebookIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/476.0.0.40.104;FBBV/123;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBLC/ja_JP;FBOP/5]",
  androidWebView:
    "Mozilla/5.0 (Linux; Android 14; SH-M26 Build/S1234; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.6613.88 Mobile Safari/537.36",
  safariIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  // The iOS home-screen app leaves out "Safari/"; it must still be allowed to sign in.
  pwaIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  chromeIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0.6613.98 Mobile/15E148 Safari/604.1",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36",
  chromeMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
};

describe("detectInAppBrowser", () => {
  it("names the app", () => {
    expect(detectInAppBrowser(UA.lineIos)).toEqual({ app: "LINE", android: false });
    expect(detectInAppBrowser(UA.lineAndroid)).toEqual({ app: "LINE", android: true });
    expect(detectInAppBrowser(UA.instagramIos)).toEqual({ app: "Instagram", android: false });
    expect(detectInAppBrowser(UA.facebookIos)).toEqual({ app: "Facebook", android: false });
  });

  it("catches an Android WebView it can't name", () => {
    expect(detectInAppBrowser(UA.androidWebView)).toEqual({ app: null, android: true });
  });

  it("lets normal browsers and the iOS home-screen app through", () => {
    for (const ua of [UA.safariIos, UA.pwaIos, UA.chromeIos, UA.chromeAndroid, UA.chromeMac, "", null, undefined]) {
      expect(detectInAppBrowser(ua)).toBeNull();
    }
  });
});

describe("chromeIntentUrl", () => {
  it("keeps the path and query", () => {
    expect(chromeIntentUrl("https://example.com/login?next=%2Fjoin%3Fcode%3DAB12")).toBe(
      "intent://example.com/login?next=%2Fjoin%3Fcode%3DAB12#Intent;scheme=https;package=com.android.chrome;end",
    );
  });
});
