import type { LoaderFunctionArgs } from "@vercel/remix";

/**
 * Minimal health check — no Shopify imports.
 * Prisma is loaded only inside try/catch so connection errors return JSON 503.
 */
export const loader = async (_args: LoaderFunctionArgs) => {
  const env = {
    hasApiKey: Boolean(process.env.SHOPIFY_API_KEY),
    hasApiSecret: Boolean(process.env.SHOPIFY_API_SECRET),
    hasAppUrl: Boolean(process.env.SHOPIFY_APP_URL),
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
    hasDirectUrl: Boolean(process.env.DIRECT_URL),
    appUrlHost: (() => {
      try {
        return process.env.SHOPIFY_APP_URL
          ? new URL(process.env.SHOPIFY_APP_URL).host
          : null;
      } catch {
        return "invalid";
      }
    })(),
  };

  let db: { ok: boolean; sessionCount?: number; error?: string } = {
    ok: false,
  };

  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    try {
      const sessionCount = await prisma.session.count();
      db = { ok: true, sessionCount };
    } finally {
      await prisma.$disconnect().catch(() => undefined);
    }
  } catch (error) {
    db = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  return new Response(JSON.stringify({ ok: db.ok, env, db }, null, 2), {
    status: db.ok ? 200 : 503,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
};
