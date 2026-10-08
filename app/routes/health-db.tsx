import type { LoaderFunctionArgs } from "@vercel/remix";

import prisma from "../db.server";

/** Prisma + Session table connectivity (production debugging). */
export const config = {
  runtime: "nodejs",
  maxDuration: 15,
};

export const loader = async (_args: LoaderFunctionArgs) => {
  try {
    const sessionCount = await prisma.session.count();
    return new Response(
      JSON.stringify(
        {
          ok: true,
          route: "health-db",
          sessionCount,
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
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Database connection failed.";
    console.error("[health-db]", error);
    return new Response(
      JSON.stringify(
        {
          ok: false,
          route: "health-db",
          error: message,
          hint:
            "Check Vercel DATABASE_URL / DIRECT_URL (Supabase pooler). Ensure Session table exists (prisma migrate deploy).",
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
  }
};
