// Gong API Authentication
// Uses Basic Auth with access key and secret

export function isGongConfigured(): boolean {
  const accessKey = process.env.GONG_ACCESS_KEY;
  const accessKeySecret = process.env.GONG_ACCESS_KEY_SECRET;
  return Boolean(accessKey && accessKeySecret);
}

export function getGongAuthHeader(): string {
  const accessKey = process.env.GONG_ACCESS_KEY;
  const accessKeySecret = process.env.GONG_ACCESS_KEY_SECRET;

  if (!accessKey || !accessKeySecret) {
    throw new Error(
      "Missing Gong credentials. Set GONG_ACCESS_KEY and GONG_ACCESS_KEY_SECRET environment variables."
    );
  }

  return `Basic ${Buffer.from(`${accessKey}:${accessKeySecret}`).toString("base64")}`;
}
