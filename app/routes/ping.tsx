import type { LoaderFunctionArgs } from "@vercel/remix";

/**
 * Isolated ping — same isolated server bundle family as /health
 * (unique config hash so Shopify routes stay out).
 */
export const config = {
  runtime: "nodejs",
  maxDuration: 10,
};

export const loader = async (_args: LoaderFunctionArgs) => {
  return new Response(
    JSON.stringify(
      {
        ok: true,
        ping: true,
        node: process.version,
      },
      null,
      2,
    ),
    {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    },
  );
};
