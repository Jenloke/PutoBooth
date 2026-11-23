import { describe, expect, it } from "vitest"

import { chromeIntentUrl, inAppBrowser, isAndroid } from "./platform"

const UA = {
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  chromeMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  messengerIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/MessengerForiOS;FBAV/470.0.0.40.109;FBBV/612345678;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBCR/;FBID/phone;FBLC/en_US;FBOP/5]",
  messengerAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.58 Mobile Safari/537.36 [FB_IAB/Orca-Android;FBAV/480.0.0.41.111;]",
  facebookIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/482.0.0.36.103;FBBV/650000000;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBID/phone;FBLC/en_US;FBOP/5;FBRV/0]",
  facebookAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.58 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/485.0.0.60.109;]",
  instagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.29.105 (iPhone15,2; iOS 17_5; en_US; en; scale=3.00; 1179x2556; 640000000)",
  tiktok:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240805.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.58 Mobile Safari/537.36 musical_ly_2023605030 JsSdk/1.0 NetType/WIFI Channel/googleplay AppName/musical_ly app_version/36.5.3 ByteLocale/en BytedanceWebview/d8a21c6",
  line: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.10.0",
}

describe("inAppBrowser", () => {
  it("recognizes the social and chat apps that open shared links", () => {
    expect(inAppBrowser(UA.messengerIos)).toBe("Messenger")
    expect(inAppBrowser(UA.messengerAndroid)).toBe("Messenger")
    expect(inAppBrowser(UA.facebookIos)).toBe("Facebook")
    expect(inAppBrowser(UA.facebookAndroid)).toBe("Facebook")
    expect(inAppBrowser(UA.instagram)).toBe("Instagram")
    expect(inAppBrowser(UA.tiktok)).toBe("TikTok")
    expect(inAppBrowser(UA.line)).toBe("LINE")
  })

  it("leaves real browsers alone", () => {
    expect(inAppBrowser(UA.safariIphone)).toBeNull()
    expect(inAppBrowser(UA.chromeAndroid)).toBeNull()
    expect(inAppBrowser(UA.chromeMac)).toBeNull()
  })
})

describe("isAndroid", () => {
  it("tells Android from iOS and desktop", () => {
    expect(isAndroid(UA.messengerAndroid)).toBe(true)
    expect(isAndroid(UA.messengerIos)).toBe(false)
    expect(isAndroid(UA.chromeMac)).toBe(false)
  })
})

describe("chromeIntentUrl", () => {
  it("keeps the path and query, so an invite code survives the switch", () => {
    expect(chromeIntentUrl("https://booth.example/?join=K7M4QD")).toBe(
      "intent://booth.example/?join=K7M4QD#Intent;scheme=https;package=com.android.chrome;end"
    )
  })
})
