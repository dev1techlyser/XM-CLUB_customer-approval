import type { LoaderFunctionArgs } from "@vercel/remix";

/**
 * Health check with layered diagnostics.
 * Never imports shopify.server. Prisma is optional and caught.
 */
export const loader = async (_args: LoaderFunctionArgs) => {
  const env = {
    hasApiKey: Boolean(process.env.SHOPIFY_API_KEY),
    hasApiSecret: Boolean(process.env.SHOPIFY_API_SECRET),
    hasAppUrl: Boolean(process.env.SHOPIFY_APP_URL),
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
    hasDirectUrl: Boolean(process.env.DIRECT_URL),
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
  };

  // Always return env first so missing secrets are visible even if DB blows up.
  let db: { ok: boolean; sessionCount?: number; error?: string } = {
    ok: false,
    error: "not_checked",
  };

  if (!env.hasDatabaseUrl) {
    db = { ok: false, error: "DATABASE_URL missing" };
  } else {
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
  }

  return new Response(JSON.stringify({ ok: db.ok, env, db }, null, 2), {
    status: db.ok ? 200 : 503,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
};
