import { PassThrough } from "stream";
import { renderToPipeableStream } from "react-dom/server";
import { RemixServer } from "@remix-run/react";
import {
  createReadableStreamFromReadable,
  type EntryContext,
} from "@remix-run/node";
import { isbot } from "isbot";

export const streamTimeout = 5000;

/**
 * No Shopify/Prisma imports — keeps /health + /ping server bundles clean.
 * Embedded CSP comes from app/routes/app.tsx `boundary.headers`.
 *
 * IMPORTANT: do NOT import createReadableStreamFromReadable from @vercel/remix —
 * that package does not export it at runtime and crashes the serverless function
 * with FUNCTION_INVOCATION_FAILED on every request.
 */
export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext,
) {
  const userAgent = request.headers.get("user-agent");
  const callbackName = isbot(userAgent ?? "") ? "onAllReady" : "onShellReady";

  return new Promise((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(
      <RemixServer context={remixContext} url={request.url} />,
      {
        [callbackName]: () => {
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set("Content-Type", "text/html");
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          );
          pipe(body);
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          console.error(error);
        },
      },
    );

    setTimeout(abort, streamTimeout + 1000);
  });
}
