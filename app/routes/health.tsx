import type { LoaderFunctionArgs } from "@vercel/remix";

/** Uptime + env/db diagnostics (no secrets). */
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

  let db: { ok: boolean; sessionCount?: number; error?: string } = { ok: false };
  try {
    const prisma = (await import("../db.server")).default;
    const sessionCount = await prisma.session.count();
    db = { ok: true, sessionCount };
  } catch (error) {
    db = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const body = JSON.stringify({ ok: db.ok, env, db }, null, 2);
  return new Response(body, {
    status: db.ok ? 200 : 503,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
};
