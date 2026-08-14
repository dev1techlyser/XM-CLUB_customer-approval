import type { ActionFunctionArgs, LoaderFunctionArgs } from "@vercel/remix";

import {
  createStorefrontApplication,
  mapContactFormToApplicationInput,
} from "../models/applications.server";
import { ensureApplicationMetaobjectDefinition, ensureShopifyDefinitions } from "../models/definitions.server";
import { checkRateLimit } from "../services/rate-limit.server";
import { authenticate, unauthenticated } from "../shopify.server";

/**
 * App Proxy replaces any 5xx from the app with storefront HTML.
 * Always return HTTP 200 + JSON; encode success/failure in `ok` / `code`.
 */
function proxyJson(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function clientKey(request: Request, email?: string): string {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  const ip = forwarded.split(",")[0]?.trim() || "unknown";
  const shop = new URL(request.url).searchParams.get("shop") || "shop";
  return `${shop}:${ip}:${(email || "").toLowerCase()}`;
}

async function authenticateProxySafe(request: Request) {
  try {
    return {
      ok: true as const,
      context: await authenticate.public.appProxy(request),
    };
  } catch (error) {
    console.error("[xm-proxy applications] proxy auth failed", error);
    return {
      ok: false as const,
      message:
        "App Proxy authentication failed. Ensure shopify app dev is running and SHOPIFY_API_SECRET is set.",
    };
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const auth = await authenticateProxySafe(request);
  if (!auth.ok) {
    return proxyJson({ ok: false, code: "proxy_auth", message: auth.message });
  }
  return proxyJson({ ok: true, service: "xm-private-reserve-applications" });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return proxyJson({ ok: false, code: "method", message: "Method not allowed." });
  }

  try {
    const auth = await authenticateProxySafe(request);
    if (!auth.ok) {
      return proxyJson({
        ok: false,
        code: "proxy_auth",
        message: auth.message,
      });
    }

    let admin = auth.context.admin;
    if (!admin) {
      const shop =
        auth.context.session?.shop ||
        new URL(request.url).searchParams.get("shop") ||
        "";
      if (!shop) {
        return proxyJson({
          ok: false,
          code: "proxy_auth",
          message:
            "No offline session for this shop. Open the embedded app once (press p) to complete install, then retry.",
        });
      }
      try {
        const result = await unauthenticated.admin(shop);
        admin = result.admin;
      } catch (sessionError) {
        console.error("[xm-proxy applications] no admin session", sessionError);
        return proxyJson({
          ok: false,
          code: "proxy_auth",
          message:
            "Could not load Admin API session. Open the app from shopify app dev (press p), then retry the form.",
        });
      }
    }

    const formData = await request.formData();
    const emailHint =
      String(formData.get("contact[email]") || formData.get("email") || "")
        .trim()
        .toLowerCase() || undefined;

    const limit = checkRateLimit({
      key: clientKey(request, emailHint),
      limit: 5,
      windowMs: 15 * 60 * 1000,
    });
    if (!limit.allowed) {
      return proxyJson({
        ok: false,
        code: "rate_limited",
        message:
          "Too many applications from this connection. Please try again later.",
        retryAfterSec: limit.retryAfterSec,
      });
    }

    // Prefer dedicated metaobject ensure so metafield GraphQL throws cannot block submissions
    try {
      const metaobject = await ensureApplicationMetaobjectDefinition(admin);
      if (!metaobject.ok) {
        console.error("[xm-proxy applications] metaobject definition missing", metaobject);
        return proxyJson({
          ok: false,
          code: "api",
          message:
            "Membership application storage is not set up yet: " +
            (metaobject.errors?.join("; ") ||
              "open the app Settings and click Ensure definitions."),
        });
      }
    } catch (ensureError) {
      console.error("[xm-proxy applications] ensure metaobject", ensureError);
      const message =
        ensureError instanceof Error
          ? ensureError.message
          : "Could not set up application storage.";
      return proxyJson({
        ok: false,
        code: "api",
        message: `Membership application storage setup failed: ${message}`,
      });
    }

    // Best-effort: customer/product metafields (do not block application create)
    try {
      await ensureShopifyDefinitions(admin);
    } catch (extraEnsureError) {
      console.warn(
        "[xm-proxy applications] optional metafield ensure failed",
        extraEnsureError,
      );
    }

    const input = mapContactFormToApplicationInput(formData);
    const result = await createStorefrontApplication(admin, input);

    if (!result.ok) {
      return proxyJson({
        ok: false,
        code: result.code,
        message: result.message,
        fieldErrors: result.fieldErrors,
      });
    }

    return proxyJson({
      ok: true,
      applicationNumber: result.applicationNumber,
      title: "Application Received",
      message:
        "Thank you for your interest in the XM Private Reserve Society. Your application has been received and will be reviewed individually.",
    });
  } catch (error) {
    console.error("[xm-proxy applications]", error);
    const message =
      error instanceof Error
        ? error.message
        : error instanceof Response
          ? `HTTP ${error.status}`
          : "Unexpected application error.";
    return proxyJson({
      ok: false,
      code: "server_error",
      message: `Application could not be saved: ${message}`,
    });
  }
};
