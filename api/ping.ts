/**
 * Standalone Vercel function — does NOT load Remix/Shopify/Prisma.
 * Hit: https://<app>.vercel.app/api/ping
 */
export default function handler(
  _req: { method?: string },
  res: {
    statusCode: number;
    setHeader: (k: string, v: string) => void;
    end: (body: string) => void;
  },
) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(
    JSON.stringify(
      {
        ok: true,
        ping: true,
        env: {
          hasApiKey: Boolean(process.env.SHOPIFY_API_KEY),
          hasApiSecret: Boolean(process.env.SHOPIFY_API_SECRET),
          hasAppUrl: Boolean(process.env.SHOPIFY_APP_URL),
          hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
          hasDirectUrl: Boolean(process.env.DIRECT_URL),
          hasScopes: Boolean(process.env.SCOPES),
          node: process.version,
        },
      },
      null,
      2,
    ),
  );
}
