import type { HeadersFunction, LoaderFunctionArgs } from "@vercel/remix";
import {
  Link,
  Outlet,
  useLoaderData,
  useMatches,
  useRouteError,
  isRouteErrorResponse,
} from "@remix-run/react";
import { Banner, Page, Text } from "@shopify/polaris";
import { NavMenu } from "@shopify/app-bridge-react";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

import { ensureShopifyDefinitions } from "../models/definitions.server";
import { authenticate } from "../shopify.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  // Idempotent: create Metaobject + Customer metafield definitions if missing
  try {
    await ensureShopifyDefinitions(admin);
  } catch {
    // Dashboard / Settings still load; Settings can retry setup
  }

  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <Link to="/app" rel="home">
          Dashboard
        </Link>
        <Link to="/app/applications">Applications</Link>
        <Link to="/app/members">Members</Link>
        <Link to="/app/settings">Settings</Link>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

function useRootApiKey(): string {
  const matches = useMatches();
  const root = matches.find((m) => m.id === "root");
  const data = root?.data as { apiKey?: string } | undefined;
  return data?.apiKey || "";
}

function errorMessage(error: unknown): string {
  if (isRouteErrorResponse(error)) {
    return error.data?.message || error.statusText || `HTTP ${error.status}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong loading the app.";
}

export function ErrorBoundary() {
  const error = useRouteError();
  const apiKey = useRootApiKey();

  if (!apiKey) {
    return boundary.error(error);
  }

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <Page title="Application error">
        <Banner tone="critical">
          <Text as="p">{errorMessage(error)}</Text>
          <Text as="p" tone="subdued">
            If this mentions the database or session, confirm Vercel env
            DATABASE_URL / DIRECT_URL and redeploy. Then open this app again to
            re-authenticate.
          </Text>
        </Banner>
      </Page>
    </AppProvider>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
