import type { LoaderFunctionArgs } from "@remix-run/node";
import {
  Form,
  useLoaderData,
  useNavigate,
  useSearchParams,
} from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Button,
  Card,
  EmptyState,
  IndexTable,
  InlineStack,
  Layout,
  Page,
  Pagination,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { useCallback, useState } from "react";

import {
  MEMBERSHIP_TYPES,
} from "../constants/private-reserve";
import {
  listApprovedMembers,
  type MemberListSort,
  customerAdminUrl,
} from "../models/customers.server";
import { authenticate } from "../shopify.server";

const SORT_OPTIONS: Array<{ label: string; value: MemberListSort }> = [
  { label: "Joined (newest)", value: "joined_desc" },
  { label: "Joined (oldest)", value: "joined_asc" },
  { label: "Name A–Z", value: "name_asc" },
  { label: "Name Z–A", value: "name_desc" },
  { label: "Member # ascending", value: "member_number_asc" },
  { label: "Member # descending", value: "member_number_desc" },
];

function isSort(value: string | null): value is MemberListSort {
  return SORT_OPTIONS.some((o) => o.value === value);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const search = url.searchParams.get("q") || "";
  const membershipType = url.searchParams.get("type") || "";
  const sortParam = url.searchParams.get("sort");
  const sort: MemberListSort = isSort(sortParam) ? sortParam : "joined_desc";
  const page = Math.max(Number(url.searchParams.get("page") || "1") || 1, 1);
  const pageSize = 25;

  const result = await listApprovedMembers(admin, {
    search,
    membershipType: membershipType || null,
    sort,
    page,
    pageSize,
  });

  return {
    ...result,
    search,
    membershipType,
    sort,
    shop: session.shop,
  };
};

export default function MembersIndexPage() {
  const {
    items,
    page,
    pageSize,
    total,
    totalPages,
    search,
    membershipType,
    sort,
    shop,
  } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [q, setQ] = useState(search);

  const buildUrl = useCallback(
    (overrides: Record<string, string | null>) => {
      const next = new URLSearchParams(params);
      for (const [key, value] of Object.entries(overrides)) {
        if (value == null || value === "") next.delete(key);
        else next.set(key, value);
      }
      const qs = next.toString();
      return qs ? `/app/members?${qs}` : "/app/members";
    },
    [params],
  );

  const rowMarkup = items.map((member, index) => (
    <IndexTable.Row
      id={member.id}
      key={member.id}
      position={index}
      onClick={() =>
        navigate(`/app/members/${encodeURIComponent(member.id)}`)
      }
    >
      <IndexTable.Cell>
        <Text as="span" variant="bodyMd" fontWeight="semibold">
          {member.memberNumber || "—"}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>{member.displayName}</IndexTable.Cell>
      <IndexTable.Cell>{member.email || "—"}</IndexTable.Cell>
      <IndexTable.Cell>{member.membershipType || "—"}</IndexTable.Cell>
      <IndexTable.Cell>
        <Badge tone="success">{member.membershipStatus || "Approved"}</Badge>
      </IndexTable.Cell>
      <IndexTable.Cell>
        {member.joinedAt || member.approvedAt
          ? new Date(member.joinedAt || member.approvedAt || "").toLocaleDateString()
          : "—"}
      </IndexTable.Cell>
      <IndexTable.Cell>
        {member.referralCode || member.memberNumber || "—"}
      </IndexTable.Cell>
      <IndexTable.Cell>
        <a
          href={customerAdminUrl(shop, member.id)}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          Open
        </a>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Page title="Members" subtitle="Approved Private Reserve members">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Form
                method="get"
                onSubmit={(e) => {
                  e.preventDefault();
                  navigate(
                    buildUrl({
                      q: q || null,
                      type: membershipType || null,
                      sort,
                      page: "1",
                    }),
                  );
                }}
              >
                <InlineStack gap="300" wrap blockAlign="end">
                  <div style={{ minWidth: 220, flex: 1 }}>
                    <TextField
                      label="Search"
                      labelHidden
                      placeholder="Name, email, member #, referral"
                      value={q}
                      onChange={setQ}
                      autoComplete="off"
                      clearButton
                      onClearButtonClick={() => setQ("")}
                    />
                  </div>
                  <div style={{ minWidth: 180 }}>
                    <Select
                      label="Membership type"
                      labelHidden
                      options={[
                        { label: "All types", value: "" },
                        ...MEMBERSHIP_TYPES.map((t) => ({
                          label: t,
                          value: t,
                        })),
                      ]}
                      value={membershipType}
                      onChange={(value) =>
                        navigate(
                          buildUrl({
                            q: q || null,
                            type: value || null,
                            sort,
                            page: "1",
                          }),
                        )
                      }
                    />
                  </div>
                  <div style={{ minWidth: 180 }}>
                    <Select
                      label="Sort"
                      labelHidden
                      options={SORT_OPTIONS}
                      value={sort}
                      onChange={(value) =>
                        navigate(
                          buildUrl({
                            q: q || null,
                            type: membershipType || null,
                            sort: value,
                            page: "1",
                          }),
                        )
                      }
                    />
                  </div>
                  <Button submit variant="primary">
                    Search
                  </Button>
                </InlineStack>
              </Form>

              <Text as="p" tone="subdued">
                {total} member{total === 1 ? "" : "s"}
                {search ? ` matching “${search}”` : ""}
              </Text>

              {items.length === 0 ? (
                <EmptyState
                  heading="No approved members yet"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>
                    Members appear here after an application is approved. They
                    are Shopify Customers tagged{" "}
                    <strong>Approved Member</strong> with{" "}
                    <code>private_reserve.*</code> metafields.
                  </p>
                </EmptyState>
              ) : (
                <>
                  <IndexTable
                    resourceName={{ singular: "member", plural: "members" }}
                    itemCount={items.length}
                    selectable={false}
                    headings={[
                      { title: "Member #" },
                      { title: "Name" },
                      { title: "Email" },
                      { title: "Membership type" },
                      { title: "Status" },
                      { title: "Joined" },
                      { title: "Referral ID" },
                      { title: "Shopify customer" },
                    ]}
                  >
                    {rowMarkup}
                  </IndexTable>
                  {totalPages > 1 ? (
                    <div style={{ padding: "12px 0" }}>
                      <Pagination
                        hasPrevious={page > 1}
                        onPrevious={() =>
                          navigate(
                            buildUrl({
                              q: search || null,
                              type: membershipType || null,
                              sort,
                              page: String(page - 1),
                            }),
                          )
                        }
                        hasNext={page < totalPages}
                        onNext={() =>
                          navigate(
                            buildUrl({
                              q: search || null,
                              type: membershipType || null,
                              sort,
                              page: String(page + 1),
                            }),
                          )
                        }
                        label={`Page ${page} of ${totalPages} · ${pageSize} per page`}
                      />
                    </div>
                  ) : null}
                </>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
