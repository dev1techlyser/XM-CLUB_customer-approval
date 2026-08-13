import type { LoaderFunctionArgs } from "@remix-run/node";

/** Lightweight uptime probe for Render / load balancers (no auth). */
export const loader = async (_args: LoaderFunctionArgs) => {
  return new Response("ok", {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
