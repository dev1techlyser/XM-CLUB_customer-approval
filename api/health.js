/** Fallback health (Vercel serverless). Remix /health should also work when deploy is correct. */
module.exports = function handler(_req, res) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(
    JSON.stringify({
      ok: true,
      route: "api/health",
      node: process.version,
    }),
  );
};
