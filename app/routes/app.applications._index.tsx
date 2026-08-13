import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate, useSearchParams } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Card,
  EmptyState,
  IndexTable,
  Layout,
  Page,
  Text,
} from "@shopify/polaris";

import {
  isApplicationStatus,
  statusLabel,
  type ApplicationStatus,
} from "../constants/private-reserve";
import { listRecentApplications } from "../models/applications.server";
import { authenticate } from "../shopify.server";

function statusTone(status: string | null) {
  switch (status) {
    case "PENDING":
      return "attention" as const;
    case "UNDER_REVIEW":
      return "info" as const;
    case "APPROVED":
      return "success" as const;
    case "WAITLISTED":
      return "warning" as const;
    case "REJECTED":
      return "critical" as const;
    default:
      return undefined;
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");
  const statusFilter =
    statusParam && isApplicationStatus(statusParam)
      ? (statusParam as ApplicationStatus)
      : null;

  const items = await listRecentApplications(admin, 50);
  const filtered = statusFilter
    ? items.filter((item) => item.status === statusFilter)
    : items;

  return { items: filtered, statusFilter };
};

export default function ApplicationsIndex() {
  const { items, statusFilter } = useLoaderData<typeof loader>();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const rowMarkup = items.map((app, index) => (
    <IndexTable.Row
      id={app.id}
      key={app.id}
      position={index}
      onClick={() =>
        navigate(`/app/applications/${encodeURIComponent(app.id)}`)
      }
    >
      <IndexTable.Cell>
        <Text as="span" variant="bodyMd" fontWeight="semibold">
          {app.applicationNumber || app.handle}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>{app.fullName || "—"}</IndexTable.Cell>
      <IndexTable.Cell>{app.email || "—"}</IndexTable.Cell>
      <IndexTable.Cell>{app.membershipType || "—"}</IndexTable.Cell>
      <IndexTable.Cell>
        {app.status ? (
          <Badge tone={statusTone(app.status)}>
            {isApplicationStatus(app.status)
              ? statusLabel(app.status)
              : app.status}
          </Badge>
        ) : (
          "—"
        )}
      </IndexTable.Cell>
      <IndexTable.Cell>
        {app.submittedAt
          ? new Date(app.submittedAt).toLocaleDateString()
          : "—"}
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Page
      title="Applications"
      subtitle="Private Reserve Society membership queue"
      secondaryActions={
        statusFilter
          ? [
              {
                content: "Clear status filter",
                onAction: () => navigate("/app/applications"),
              },
            ]
          : undefined
      }
    >
      <Layout>
        <Layout.Section>
          <Card padding="0">
            {statusFilter ? (
              <div style={{ padding: "12px 16px" }}>
                <Text as="p" tone="subdued">
                  Filtered by status: {statusLabel(statusFilter)}
                  {params.get("status") ? "" : ""}
                </Text>
              </div>
            ) : null}

            {items.length === 0 ? (
              <EmptyState
                heading="No applications yet"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  Storefront applications appear here after the membership form
                  submits to Metaobject{" "}
                  <strong>private_reserve_application</strong>.
                </p>
              </EmptyState>
            ) : (
              <IndexTable
                resourceName={{ singular: "application", plural: "applications" }}
                itemCount={items.length}
                selectable={false}
                headings={[
                  { title: "Application #" },
                  { title: "Applicant" },
                  { title: "Email" },
                  { title: "Membership" },
                  { title: "Status" },
                  { title: "Submitted" },
                ]}
              >
                {rowMarkup}
              </IndexTable>
            )}
          </Card>
          <BlockStack gap="200">
            <div style={{ marginTop: 12 }}>
              <Text as="p" variant="bodySm" tone="subdued">
                Phase 2: storefront creates PENDING Metaobject applications.
                Approve / Reject / Waitlist sync is Phase 3.
              </Text>
            </div>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
