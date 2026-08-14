import type { ActionFunctionArgs, LoaderFunctionArgs } from "@vercel/remix";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import {
  Banner,
  BlockStack,
  Button,
  Card,
  DescriptionList,
  Layout,
  Page,
  Text,
} from "@shopify/polaris";

import {
  APPROVED_MEMBER_TAG,
  CUSTOMER_METAFIELD_NAMESPACE,
  METAOBJECT_DISPLAY_NAME,
  METAOBJECT_TYPE,
  PRODUCT_MEMBERS_ONLY_KEY,
  PRODUCT_METAFIELD_NAMESPACE,
} from "../constants/private-reserve";
import {
  ensureShopifyDefinitions,
  getDefinitionsStatus,
} from "../models/definitions.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const status = await getDefinitionsStatus(admin);
  return {
    shop: session.shop,
    status,
    approvedMemberTag: APPROVED_MEMBER_TAG,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  if (formData.get("intent") !== "ensure_definitions") {
    return { ok: false as const, error: "Unknown action" };
  }

  try {
    const result = await ensureShopifyDefinitions(admin);
    if (!result.ok) {
      return {
        ok: false as const,
        error:
          [
            ...result.metaobject.errors,
            ...result.metafields.errors,
            ...result.products.errors,
          ].join("; ") || "Setup failed",
      };
    }
    return {
      ok: true as const,
      message: result.metaobject.created
        ? "Metaobject definition created (customer + product metafields synced)."
        : "Definitions already present (customer + product metafields synced).",
    };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Setup failed",
    };
  }
};

export default function SettingsPage() {
  const { shop, status, approvedMemberTag } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";

  return (
    <Page title="Settings" subtitle="XM Private Reserve configuration">
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {actionData?.ok === false ? (
              <Banner tone="critical" title="Setup failed">
                <p>{actionData.error}</p>
              </Banner>
            ) : null}
            {actionData?.ok === true ? (
              <Banner tone="success" title="Setup complete">
                <p>{actionData.message}</p>
              </Banner>
            ) : null}

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Protected customer data
                </Text>
                <Text as="p" tone="subdued">
                  Approve creates/finds Shopify Customers (name + email). Partner
                  apps must enable Protected customer data before that works —
                  scopes alone are not enough.
                </Text>
                <Text as="p">
                  Partner Dashboard → Apps → xm-private-reserve → API access →
                  Protected customer data access → Request access → select
                  Protected customer data, then Name and Email fields → Save.
                  Development stores do not need Shopify review after Save.
                </Text>
                <Text as="p" tone="subdued">
                  Docs:{" "}
                  <a
                    href="https://shopify.dev/docs/apps/launch/protected-customer-data"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Protected customer data
                  </a>
                </Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Shopify definitions
                </Text>
                <Text as="p" tone="subdued">
                  Option C: Metaobjects store applications. Customer metafields
                  store membership data after approval. Product metafield{" "}
                  <code>
                    {PRODUCT_METAFIELD_NAMESPACE}.{PRODUCT_MEMBERS_ONLY_KEY}
                  </code>{" "}
                  gates member-only purchase UI. No application database.
                </Text>
                <DescriptionList
                  items={[
                    { term: "Shop", description: shop },
                    {
                      term: "Metaobject type",
                      description: `${METAOBJECT_TYPE} (${METAOBJECT_DISPLAY_NAME})`,
                    },
                    {
                      term: "Metaobject status",
                      description: status.metaobject.exists
                        ? `Installed · ${"id" in status.metaobject ? status.metaobject.id : ""}`
                        : "Missing — run setup",
                    },
                    {
                      term: "Customer metafield namespace",
                      description: CUSTOMER_METAFIELD_NAMESPACE,
                    },
                    {
                      term: "Customer metafields present",
                      description:
                        status.customerMetafields.present.join(", ") || "None",
                    },
                    {
                      term: "Customer metafields missing",
                      description:
                        status.customerMetafields.missing.join(", ") || "None",
                    },
                    {
                      term: "Product metafields present",
                      description:
                        status.productMetafields.present.join(", ") || "None",
                    },
                    {
                      term: "Product metafields missing",
                      description:
                        status.productMetafields.missing.join(", ") || "None",
                    },
                    {
                      term: "Approved member tag",
                      description: approvedMemberTag,
                    },
                  ]}
                />
                <Form method="post">
                  <input type="hidden" name="intent" value="ensure_definitions" />
                  <Button submit variant="primary" loading={busy}>
                    Ensure Metaobject & metafield definitions
                  </Button>
                </Form>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
