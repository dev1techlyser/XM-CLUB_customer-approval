import "@shopify/shopify-app-remix/adapters/vercel";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
  type LoginError,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

type ShopifyAppInstance = ReturnType<typeof shopifyApp>;

let _shopify: ShopifyAppInstance | null = null;

function createShopifyApp(): ShopifyAppInstance {
  const sessionStorage = new PrismaSessionStorage(prisma, {
    connectionRetries: 5,
    connectionRetryIntervalMs: 1000,
  });

  // Constructor kicks off an internal poll that can reject as unhandled.
  const internalReady = (
    sessionStorage as unknown as { ready?: Promise<boolean> }
  ).ready;
  if (internalReady?.catch) {
    void internalReady.catch((error: unknown) => {
      console.error("[shopify.server] session storage poll failed:", error);
    });
  }

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

/** Lazily create the Shopify app so /health does not boot session storage. */
export function getShopifyApp(): ShopifyAppInstance {
  if (!_shopify) {
    _shopify = createShopifyApp();
  }
  return _shopify;
}

const shopifyProxy = new Proxy({} as ShopifyAppInstance, {
  get(_target, prop, receiver) {
    return Reflect.get(getShopifyApp(), prop, receiver);
  },
});

export default shopifyProxy;
export const apiVersion = ApiVersion.January26;

export const addDocumentResponseHeaders: ShopifyAppInstance["addDocumentResponseHeaders"] =
  (...args) => getShopifyApp().addDocumentResponseHeaders(...args);

export const authenticate = new Proxy(
  {} as ShopifyAppInstance["authenticate"],
  {
    get(_target, prop, receiver) {
      return Reflect.get(getShopifyApp().authenticate, prop, receiver);
    },
  },
);

export const unauthenticated = new Proxy(
  {} as ShopifyAppInstance["unauthenticated"],
  {
    get(_target, prop, receiver) {
      return Reflect.get(getShopifyApp().unauthenticated, prop, receiver);
    },
  },
);

export const login = ((...args: Parameters<ShopifyAppInstance["login"]>) =>
  getShopifyApp().login(...args)) as ShopifyAppInstance["login"];

export const registerWebhooks: ShopifyAppInstance["registerWebhooks"] = (
  ...args
) => getShopifyApp().registerWebhooks(...args);

export const sessionStorage = new Proxy(
  {} as ShopifyAppInstance["sessionStorage"],
  {
    get(_target, prop, receiver) {
      return Reflect.get(getShopifyApp().sessionStorage, prop, receiver);
    },
  },
);

export type { LoginError };
