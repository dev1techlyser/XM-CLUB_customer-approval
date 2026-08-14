import type { LoaderFunctionArgs } from "@vercel/remix";

/**
 * Isolated health probe.
 * Unique `config` → separate Vercel server bundle so Shopify/Prisma
 * routes are NOT loaded into this function.
 */
export const config = {
  runtime: "nodejs",
  maxDuration: 10,
};

export const loader = async (_args: LoaderFunctionArgs) => {
  const body = {
    ok: true,
    route: "health",
    env: {
      hasApiKey: Boolean(process.env.SHOPIFY_API_KEY),
      hasApiSecret: Boolean(process.env.SHOPIFY_API_SECRET),
      hasAppUrl: Boolean(process.env.SHOPIFY_APP_URL),
      hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
      hasDirectUrl: Boolean(process.env.DIRECT_URL),
      hasScopes: Boolean(process.env.SCOPES),
      node: process.version,
      appUrlHost: (() => {
        try {
          return process.env.SHOPIFY_APP_URL
            ? new URL(process.env.SHOPIFY_APP_URL).host
            : null;
        } catch {
          return "invalid";
        }
      })(),
    },
  };

  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
};
