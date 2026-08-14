import type { LoaderFunctionArgs } from "@vercel/remix";
import { Link, useLoaderData } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Box,
  Card,
  InlineGrid,
  InlineStack,
  Layout,
  Page,
  Text,
} from "@shopify/polaris";

import {
  statusLabel,
  type ApplicationStatus,
} from "../constants/private-reserve";
import { getDashboardCounts } from "../models/applications.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const counts = await getDashboardCounts(admin);
  return { shop: session.shop, counts };
};

function CountCard({
  title,
  value,
  tone,
  to,
}: {
  title: string;
  value: number;
  tone?: "info" | "success" | "attention" | "warning" | "critical";
  to: string;
}) {
  return (
    <Card>
      <BlockStack gap="200">
        <InlineStack align="space-between" blockAlign="center">
          <Text as="h3" variant="headingSm" tone="subdued">
            {title}
          </Text>
          {tone ? <Badge tone={tone}>{title}</Badge> : null}
        </InlineStack>
        <Text as="p" variant="heading2xl">
          {value}
        </Text>
        <Link to={to} style={{ textDecoration: "none" }}>
          <Text as="span" variant="bodySm" tone="magic">
            View applications →
          </Text>
        </Link>
      </BlockStack>
    </Card>
  );
}

const CARDS: Array<{
  status: ApplicationStatus;
  tone: "info" | "success" | "attention" | "warning" | "critical";
}> = [
  { status: "PENDING", tone: "attention" },
  { status: "UNDER_REVIEW", tone: "info" },
  { status: "APPROVED", tone: "success" },
  { status: "WAITLISTED", tone: "warning" },
  { status: "REJECTED", tone: "critical" },
];

export default function Dashboard() {
  const { counts } = useLoaderData<typeof loader>();

  return (
    <Page
      title="XM Private Reserve"
      subtitle="Membership operations dashboard"
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Box paddingBlockEnd="200">
              <Text as="p" variant="bodyMd" tone="subdued">
                Counts are live from the{" "}
                <Text as="span" fontWeight="semibold">
                  private_reserve_application
                </Text>{" "}
                Metaobject — Shopify is the application database.
              </Text>
            </Box>
            <InlineGrid columns={{ xs: 1, sm: 2, md: 3, lg: 5 }} gap="400">
              {CARDS.map(({ status, tone }) => (
                <CountCard
                  key={status}
                  title={statusLabel(status)}
                  value={counts[status]}
                  tone={tone}
                  to={`/app/applications?status=${status}`}
                />
              ))}
            </InlineGrid>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
