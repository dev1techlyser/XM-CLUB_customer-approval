/**
 * Classic Vercel Node function (CommonJS) — outside Remix SSR.
 * If Remix still catches /api/*, use /ping instead.
 */
module.exports = function handler(_req, res) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(
    JSON.stringify({
      ok: true,
      ping: true,
      via: "api/ping.js",
      node: process.version,
      env: {
        hasApiKey: Boolean(process.env.SHOPIFY_API_KEY),
        hasAppUrl: Boolean(process.env.SHOPIFY_APP_URL),
        hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
      },
    }),
  );
};
