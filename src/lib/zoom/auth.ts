import type { ZoomAccessToken } from "@/types/zoom";

let cachedToken: ZoomAccessToken | null = null;
let tokenExpiry: number = 0;

export function isZoomConfigured(): boolean {
  const accountId = process.env.ZOOM_ACCOUNT_ID;
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  return Boolean(accountId && clientId && clientSecret);
}

export async function getZoomAccessToken(): Promise<string | null> {
  if (!isZoomConfigured()) {
    return null;
  }
  // Return cached token if still valid (with 5-minute buffer)
  if (cachedToken && Date.now() < tokenExpiry - 5 * 60 * 1000) {
    return cachedToken.access_token;
  }

  const accountId = process.env.ZOOM_ACCOUNT_ID;
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;

  if (!accountId || !clientId || !clientSecret) {
    return null;
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64"
  );

  const response = await fetch("https://zoom.us/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "account_credentials",
      account_id: accountId,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Zoom OAuth failed: ${response.status} - ${error}`);
  }

  cachedToken = (await response.json()) as ZoomAccessToken;
  tokenExpiry = Date.now() + cachedToken.expires_in * 1000;

  return cachedToken.access_token;
}
