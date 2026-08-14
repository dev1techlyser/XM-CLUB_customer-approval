import type { ActionFunctionArgs, LoaderFunctionArgs } from "@vercel/remix";
import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
} from "@remix-run/react";
import type { ReactNode } from "react";
import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  DescriptionList,
  Divider,
  InlineStack,
  Layout,
  Page,
  Text,
} from "@shopify/polaris";

import {
  APPROVED_MEMBER_TAG,
  isApplicationStatus,
  statusLabel,
  type ApplicationStatus,
} from "../constants/private-reserve";
import {
  approveApplication,
  getApplicationById,
  markApplicationUnderReview,
  rejectApplication,
  resendApprovalEmail,
  waitlistApplication,
} from "../models/applications.server";
import { customerAdminUrl, protectedCustomerDataMessage } from "../models/customers.server";
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

function DetailCard({
  title,
  items,
}: {
  title: string;
  items: { term: string; description: ReactNode }[];
}) {
  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">
          {title}
        </Text>
        <DescriptionList
          items={items.map((item) => ({
            term: item.term,
            description: item.description || "—",
          }))}
        />
      </BlockStack>
    </Card>
  );
}

function adminActor(session: {
  shop: string;
  email?: string;
  onlineAccessInfo?: unknown;
}) {
  const online = session.onlineAccessInfo as
    | { associated_user?: { id?: number; email?: string } }
    | undefined;
  if (online?.associated_user?.email) return online.associated_user.email;
  if (online?.associated_user?.id) return `admin:${online.associated_user.id}`;
  if (session.email) return session.email;
  return `staff@${session.shop}`;
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const id = params.id;
  if (!id) throw new Response("Not found", { status: 404 });

  const gid = decodeURIComponent(id);
  const application = await getApplicationById(admin, gid);
  if (!application) throw new Response("Not found", { status: 404 });

  return {
    application,
    shop: session.shop,
    customerUrl: application.shopifyCustomerId
      ? customerAdminUrl(session.shop, application.shopifyCustomerId)
      : null,
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const id = params.id;
  if (!id) return { ok: false as const, message: "Missing application id" };

  const gid = decodeURIComponent(id);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  const performedBy = adminActor(session);

  try {
    if (intent === "mark_under_review") {
      return markApplicationUnderReview({
        admin,
        applicationId: gid,
        performedBy,
      });
    }
    if (intent === "approve") {
      return approveApplication({
        admin,
        applicationId: gid,
        performedBy,
        shop: session.shop,
      });
    }
    if (intent === "reject") {
      return rejectApplication({
        admin,
        applicationId: gid,
        performedBy,
      });
    }
    if (intent === "waitlist") {
      return waitlistApplication({
        admin,
        applicationId: gid,
        performedBy,
      });
    }
    if (intent === "resend_approval_email") {
      return resendApprovalEmail({
        admin,
        applicationId: gid,
        performedBy,
        shop: session.shop,
      });
    }
    return { ok: false as const, message: "Unknown action" };
  } catch (error) {
    return {
      ok: false as const,
      message: protectedCustomerDataMessage(error),
    };
  }
};

export default function ApplicationDetail() {
  const { application, customerUrl } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";

  const current = actionData && "application" in actionData && actionData.application
    ? actionData.application
    : application;

  const status = current.status;
  const isApproved = status === "APPROVED";
  const canReview = status === "PENDING" || status === "WAITLISTED";
  const canDecide =
    status === "PENDING" ||
    status === "UNDER_REVIEW" ||
    status === "WAITLISTED";

  const resolvedCustomerUrl =
    (actionData && "customerAdminUrl" in actionData && actionData.customerAdminUrl) ||
    customerUrl;

  return (
    <Page
      title={current.fullName || "Application"}
      subtitle={current.applicationNumber || current.handle}
      backAction={{ content: "Applications", url: "/app/applications" }}
      titleMetadata={
        status ? (
          <Badge tone={statusTone(status)}>
            {isApplicationStatus(status)
              ? statusLabel(status as ApplicationStatus)
              : status}
          </Badge>
        ) : undefined
      }
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {actionData?.ok === false ? (
              <Banner tone="critical" title="Action failed">
                <p>{actionData.message}</p>
                {/protected customer data/i.test(actionData.message) ? (
                  <p>
                    Also see{" "}
                    <Link to="/app/settings">Settings → Protected customer data</Link>
                    .
                  </p>
                ) : null}
              </Banner>
            ) : null}
            {actionData?.ok === true ? (
              <Banner tone="success" title="Saved">
                <p>{actionData.message}</p>
                {"inviteWarning" in actionData && actionData.inviteWarning ? (
                  <p>{actionData.inviteWarning}</p>
                ) : null}
              </Banner>
            ) : null}

            {isApproved ? (
              <Card>
                <BlockStack gap="300">
                  <InlineStack gap="200" blockAlign="center">
                    <Badge tone="success">{APPROVED_MEMBER_TAG}</Badge>
                    <Text as="h2" variant="headingMd">
                      Membership
                    </Text>
                  </InlineStack>
                  <DescriptionList
                    items={[
                      {
                        term: "Member number",
                        description: current.memberNumber || "—",
                      },
                      {
                        term: "Membership type",
                        description: current.membershipType || "—",
                      },
                      {
                        term: "Shopify customer",
                        description: current.shopifyCustomerId ? (
                          resolvedCustomerUrl ? (
                            <a
                              href={resolvedCustomerUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open customer in Admin
                            </a>
                          ) : (
                            current.shopifyCustomerId
                          )
                        ) : (
                          "—"
                        ),
                      },
                      {
                        term: "Approval date",
                        description: current.approvedAt
                          ? new Date(current.approvedAt).toLocaleString()
                          : "—",
                      },
                      {
                        term: "Approval email sent",
                        description: current.approvalEmailSentAt
                          ? new Date(
                              current.approvalEmailSentAt,
                            ).toLocaleString()
                          : "Not sent yet",
                      },
                    ]}
                  />
                  <Form method="post">
                    <input
                      type="hidden"
                      name="intent"
                      value="resend_approval_email"
                    />
                    <Button submit disabled={busy}>
                      Resend Approval Email
                    </Button>
                  </Form>
                </BlockStack>
              </Card>
            ) : null}

            <DetailCard
              title="Applicant"
              items={[
                { term: "Full name", description: current.fullName || "" },
                { term: "Email", description: current.email || "" },
              ]}
            />
            <DetailCard
              title="Membership"
              items={[
                {
                  term: "Membership type",
                  description: current.membershipType || "",
                },
              ]}
            />
            <DetailCard
              title="Application"
              items={[
                {
                  term: "How did they hear about XM?",
                  description: current.howDidHear || "",
                },
                {
                  term: "What interests them about membership?",
                  description: current.membershipInterest || "",
                },
                {
                  term: "Favorite cigar brands",
                  description: current.favoriteCigarBrands || "",
                },
                {
                  term: "Attended XM event",
                  description: current.attendedXmEvent || "",
                },
              ]}
            />
            <DetailCard
              title="Referral"
              items={[
                {
                  term: "Member referral",
                  description: current.hasMemberReferral || "",
                },
                {
                  term: "Referring member name",
                  description: current.referringMemberName || "",
                },
                {
                  term: "Referring member number (resolved)",
                  description: current.referringMemberNumber || "",
                },
                {
                  term: "Referring Shopify customer",
                  description: current.referringCustomerId ? (
                    <a
                      href={`/app/members/${encodeURIComponent(current.referringCustomerId)}`}
                    >
                      View referring member
                    </a>
                  ) : (
                    ""
                  ),
                },
                {
                  term: "Relationship",
                  description: current.referralRelationship || "",
                },
                {
                  term: "How long known",
                  description: current.referralRelationshipDuration || "",
                },
              ]}
            />
            <DetailCard
              title="Social Profile"
              items={[
                {
                  term: "Instagram or LinkedIn",
                  description: current.socialProfile || "",
                },
              ]}
            />
            <DetailCard
              title="Additional Notes"
              items={[
                {
                  term: "Applicant notes",
                  description: current.additionalNotes || "",
                },
                {
                  term: "Admin notes / audit",
                  description: (
                    <span style={{ whiteSpace: "pre-wrap" }}>
                      {current.adminNotes || "—"}
                    </span>
                  ),
                },
              ]}
            />
            <DetailCard
              title="Form Metadata"
              items={[
                { term: "Form type", description: current.formType || "" },
                {
                  term: "Request type",
                  description: current.requestType || "",
                },
                {
                  term: "Source page",
                  description: current.sourcePage || "",
                },
                {
                  term: "Admin action (informational only)",
                  description: current.adminAction || "",
                },
              ]}
            />
          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Status
              </Text>
              {status ? (
                <Badge tone={statusTone(status)} size="large">
                  {isApplicationStatus(status)
                    ? statusLabel(status as ApplicationStatus)
                    : status}
                </Badge>
              ) : (
                <Text as="p">—</Text>
              )}
              <Text as="p" variant="bodySm" tone="subdued">
                Submitted{" "}
                {current.submittedAt
                  ? new Date(current.submittedAt).toLocaleString()
                  : "—"}
              </Text>
              {current.rejectedAt ? (
                <Text as="p" variant="bodySm" tone="subdued">
                  Rejected {new Date(current.rejectedAt).toLocaleString()}
                </Text>
              ) : null}
              {current.waitlistedAt ? (
                <Text as="p" variant="bodySm" tone="subdued">
                  Waitlisted {new Date(current.waitlistedAt).toLocaleString()}
                </Text>
              ) : null}
              <Divider />

              {canReview ? (
                <Form method="post">
                  <input type="hidden" name="intent" value="mark_under_review" />
                  <Button submit disabled={busy} fullWidth>
                    Mark Under Review
                  </Button>
                </Form>
              ) : null}

              {canDecide || isApproved ? (
                <Form method="post">
                  <input type="hidden" name="intent" value="approve" />
                  <Button
                    submit
                    variant="primary"
                    disabled={busy}
                    fullWidth
                  >
                    {isApproved ? "Approve (idempotent)" : "Approve"}
                  </Button>
                </Form>
              ) : null}

              {canDecide ? (
                <>
                  <Form method="post">
                    <input type="hidden" name="intent" value="waitlist" />
                    <Button submit disabled={busy} fullWidth>
                      Waitlist
                    </Button>
                  </Form>
                  <Form method="post">
                    <input type="hidden" name="intent" value="reject" />
                    <Button submit tone="critical" disabled={busy} fullWidth>
                      Reject
                    </Button>
                  </Form>
                </>
              ) : null}

              <Text as="p" variant="bodySm" tone="subdued">
                Approve finds or creates the Shopify customer, adds the{" "}
                {APPROVED_MEMBER_TAG} tag, writes private_reserve metafields,
                and sends an account invite when possible. Status timestamps and
                admin notes provide Shopify-native audit history (no external DB).
                Requires Partner Dashboard → API access → Protected customer data
                (Name + Email) for development stores.
              </Text>
              <InlineStack gap="200">
                <Link to="/app/applications">Back to list</Link>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
