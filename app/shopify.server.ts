import "@shopify/shopify-app-remix/adapters/vercel";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

/**
 * Lazy init avoids unhandled rejections from PrismaSessionStorage.pollForTable()
 * crashing the whole Vercel isolate on cold start when DB is briefly unreachable.
 */
function createShopifyApp() {
  const sessionStorage = new PrismaSessionStorage(prisma, {
    connectionRetries: 5,
    connectionRetryIntervalMs: 1000,
  });

  // Constructor starts an internal readiness poll that rejects as unhandled
  // if the Session table/DB is unreachable — absorb it, then use isReady().
  const internalReady = (sessionStorage as unknown as { ready?: Promise<boolean> })
    .ready;
  if (internalReady?.catch) {
    void internalReady.catch((error: unknown) => {
      console.error("[shopify.server] session storage poll failed:", error);
    });
  }

  void sessionStorage.isReady().then((ok) => {
    if (!ok) console.error("[shopify.server] session storage isReady=false");
  });

  return shopifyApp({
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
    apiVersion: ApiVersion.January26,
    scopes: process.env.SCOPES?.split(","),
    appUrl: process.env.SHOPIFY_APP_URL || "",
    authPathPrefix: "/auth",
    sessionStorage: sessionStorage as never,
    distribution: AppDistribution.SingleMerchant,
    future: {
      unstable_newEmbeddedAuthStrategy: true,
      expiringOfflineAccessTokens: true,
    },
    ...(process.env.SHOP_CUSTOM_DOMAIN
      ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
      : {}),
  });
}

const shopify = createShopifyApp();

export default shopify;
export const apiVersion = ApiVersion.January26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
