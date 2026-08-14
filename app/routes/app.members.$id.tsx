import type { LoaderFunctionArgs } from "@vercel/remix";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Button,
  Card,
  DescriptionList,
  InlineStack,
  Layout,
  Page,
  Text,
} from "@shopify/polaris";
import type { ReactNode } from "react";

import { getApplicationById } from "../models/applications.server";
import {
  customerAdminUrl,
  getApprovedMemberById,
} from "../models/customers.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const id = params.id;
  if (!id) {
    throw new Response("Not found", { status: 404 });
  }

  const member = await getApprovedMemberById(admin, id);
  if (!member) {
    throw new Response("Member not found", { status: 404 });
  }

  let application = null;
  if (member.applicationId) {
    application = await getApplicationById(admin, member.applicationId);
  }

  return {
    member,
    application,
    shop: session.shop,
    shopifyCustomerUrl: customerAdminUrl(session.shop, member.id),
  };
};

function DetailCard({
  title,
  items,
}: {
  title: string;
  items: Array<{ term: string; description: ReactNode }>;
}) {
  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">
          {title}
        </Text>
        <DescriptionList items={items} />
      </BlockStack>
    </Card>
  );
}

export default function MemberDetailPage() {
  const { member, application, shopifyCustomerUrl } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();

  return (
    <Page
      title={member.displayName}
      subtitle={member.memberNumber || "Approved member"}
      backAction={{ content: "Members", onAction: () => navigate("/app/members") }}
      secondaryActions={[
        {
          content: "Open in Shopify",
          url: shopifyCustomerUrl,
          external: true,
        },
      ]}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <DetailCard
              title="Membership"
              items={[
                {
                  term: "Member number",
                  description: member.memberNumber || "—",
                },
                { term: "Name", description: member.displayName },
                { term: "Email", description: member.email || "—" },
                {
                  term: "Membership type",
                  description: member.membershipType || "—",
                },
                {
                  term: "Membership status",
                  description: (
                    <Badge tone="success">
                      {member.membershipStatus || "Approved"}
                    </Badge>
                  ),
                },
                {
                  term: "Joined date",
                  description: member.joinedAt
                    ? new Date(member.joinedAt).toLocaleString()
                    : "—",
                },
                {
                  term: "Approved date",
                  description: member.approvedAt
                    ? new Date(member.approvedAt).toLocaleString()
                    : "—",
                },
              ]}
            />

            <DetailCard
              title="Application"
              items={[
                {
                  term: "Application number",
                  description: member.applicationNumber || "—",
                },
                {
                  term: "Application",
                  description: member.applicationId ? (
                    <Button
                      variant="plain"
                      onClick={() =>
                        navigate(
                          `/app/applications/${encodeURIComponent(member.applicationId!)}`,
                        )
                      }
                    >
                      Open application
                    </Button>
                  ) : (
                    "—"
                  ),
                },
              ]}
            />

            <DetailCard
              title="Referral"
              items={[
                {
                  term: "Member referral ID",
                  description:
                    member.referralCode || member.memberNumber || "—",
                },
                {
                  term: "Applicant had member referral",
                  description: application?.hasMemberReferral || "—",
                },
                {
                  term: "Referring member name (stated)",
                  description: application?.referringMemberName || "—",
                },
                {
                  term: "Referring member number (resolved)",
                  description: application?.referringMemberNumber || "—",
                },
                {
                  term: "Referring Shopify customer",
                  description: application?.referringCustomerId ? (
                    <Button
                      variant="plain"
                      onClick={() =>
                        navigate(
                          `/app/members/${encodeURIComponent(application.referringCustomerId!)}`,
                        )
                      }
                    >
                      View referring member
                    </Button>
                  ) : (
                    "—"
                  ),
                },
                {
                  term: "Relationship",
                  description: application?.referralRelationship || "—",
                },
                {
                  term: "How long known",
                  description:
                    application?.referralRelationshipDuration || "—",
                },
              ]}
            />

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Shopify customer
                </Text>
                <InlineStack gap="300">
                  <Button url={shopifyCustomerUrl} external>
                    Open customer in Admin
                  </Button>
                  {!member.hasApprovedTag ? (
                    <Text as="p" tone="critical">
                      Warning: Approved Member tag is missing on this customer.
                      Member content and products will be gated on the storefront.
                    </Text>
                  ) : null}
                </InlineStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
