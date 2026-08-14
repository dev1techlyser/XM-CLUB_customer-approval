import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

import {
  APPROVED_MEMBER_TAG,
  CUSTOMER_MEMBERSHIP_STATUS_APPROVED,
  CUSTOMER_METAFIELD_NAMESPACE,
  formatMemberNumber,
  isMembershipType,
  LEGACY_MEMBER_TAG,
  type MembershipType,
} from "../constants/private-reserve";
import {
  isProtectedCustomerDataError,
  protectedCustomerDataMessage,
  type MemberListSort,
} from "./customers.shared";

export {
  customerAdminUrl,
  isProtectedCustomerDataError,
  protectedCustomerDataMessage,
  type MemberListSort,
} from "./customers.shared";

type AdminClient = AdminApiContext;

export type ShopifyCustomerSummary = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  tags: string[];
  memberNumber: string | null;
};

/**
 * Safest split for a single "full name" field.
 * One token → firstName only (empty lastName). Never invents names.
 */
export function splitFullName(fullName: string): {
  firstName: string;
  lastName: string;
} {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

export async function findCustomerByEmail(
  admin: AdminClient,
  email: string,
): Promise<ShopifyCustomerSummary | null> {
  const normalized = email.trim().toLowerCase();
  try {
    const response = await admin.graphql(
      `#graphql
      query FindCustomerByEmail($query: String!) {
        customers(first: 5, query: $query) {
          nodes {
            id
            email
            firstName
            lastName
            tags
            memberNumber: metafield(namespace: "private_reserve", key: "member_number") {
              value
            }
          }
        }
      }`,
      {
        variables: {
          query: `email:${JSON.stringify(normalized)}`,
        },
      },
    );

    const json: {
      data?: {
        customers?: {
          nodes?: Array<{
            id: string;
            email?: string | null;
            firstName?: string | null;
            lastName?: string | null;
            tags?: string[];
            memberNumber?: { value?: string | null } | null;
          }>;
        };
      };
      errors?: Array<{ message: string }>;
    } = await response.json();

    if (json.errors?.some((e) => isProtectedCustomerDataError(e.message))) {
      throw new Error(protectedCustomerDataMessage());
    }

    const nodes = json.data?.customers?.nodes ?? [];
    const exact =
      nodes.find((n) => n.email?.toLowerCase() === normalized) || nodes[0];
    if (!exact) return null;

    return {
      id: exact.id,
      email: exact.email ?? null,
      firstName: exact.firstName ?? null,
      lastName: exact.lastName ?? null,
      tags: exact.tags ?? [],
      memberNumber: exact.memberNumber?.value ?? null,
    };
  } catch (error) {
    if (isProtectedCustomerDataError(error)) {
      throw new Error(protectedCustomerDataMessage());
    }
    throw error;
  }
}

export async function createCustomer(params: {
  admin: AdminClient;
  email: string;
  fullName: string;
}): Promise<{ ok: true; customer: ShopifyCustomerSummary } | { ok: false; message: string }> {
  const { firstName, lastName } = splitFullName(params.fullName);
  if (!firstName) {
    return { ok: false, message: "Application is missing a valid full name." };
  }

  try {
    const response = await params.admin.graphql(
      `#graphql
      mutation CreatePrivateReserveCustomer($input: CustomerInput!) {
        customerCreate(input: $input) {
          customer {
            id
            email
            firstName
            lastName
            tags
          }
          userErrors {
            field
            message
          }
        }
      }`,
      {
        variables: {
          input: {
            email: params.email.trim().toLowerCase(),
            firstName,
            lastName: lastName || undefined,
            tags: [],
          },
        },
      },
    );

    const json: {
      data?: {
        customerCreate?: {
          customer?: {
            id: string;
            email?: string | null;
            firstName?: string | null;
            lastName?: string | null;
            tags?: string[];
          } | null;
          userErrors?: Array<{ message: string }>;
        };
      };
      errors?: Array<{ message: string }>;
    } = await response.json();

    const userErrors = json.data?.customerCreate?.userErrors ?? [];
    if (json.errors?.length || userErrors.length) {
      const apiMessage =
        json.errors?.[0]?.message || userErrors[0]?.message || "";
      if (isProtectedCustomerDataError(apiMessage)) {
        return { ok: false, message: protectedCustomerDataMessage() };
      }
      // Race: customer created between find and create — re-find
      try {
        const existing = await findCustomerByEmail(params.admin, params.email);
        if (existing) {
          return { ok: true, customer: existing };
        }
      } catch (findError) {
        if (isProtectedCustomerDataError(findError)) {
          return { ok: false, message: protectedCustomerDataMessage() };
        }
      }
      return {
        ok: false,
        message:
          userErrors[0]?.message ||
          "Shopify could not create the customer. Please retry approval.",
      };
    }

    const customer = json.data?.customerCreate?.customer;
    if (!customer?.id) {
      return {
        ok: false,
        message: "Shopify could not create the customer. Please retry approval.",
      };
    }

    return {
      ok: true,
      customer: {
        id: customer.id,
        email: customer.email ?? null,
        firstName: customer.firstName ?? null,
        lastName: customer.lastName ?? null,
        tags: customer.tags ?? [],
        memberNumber: null,
      },
    };
  } catch (error) {
    if (isProtectedCustomerDataError(error)) {
      return { ok: false, message: protectedCustomerDataMessage() };
    }
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Shopify could not create the customer. Please retry approval.",
    };
  }
}

export async function addApprovedMemberTag(
  admin: AdminClient,
  customerId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const response = await admin.graphql(
    `#graphql
      mutation AddApprovedMemberTag($id: ID!, $tags: [String!]!) {
        tagsAdd(id: $id, tags: $tags) {
          node {
            ... on Customer {
              id
              tags
            }
          }
          userErrors {
            message
          }
        }
      }`,
    {
      variables: {
        id: customerId,
        tags: [APPROVED_MEMBER_TAG, LEGACY_MEMBER_TAG],
      },
    },
  );

  const json: {
    data?: {
      tagsAdd?: {
        userErrors?: Array<{ message: string }>;
      };
    };
    errors?: Array<{ message: string }>;
  } = await response.json();

  const userErrors = json.data?.tagsAdd?.userErrors ?? [];
  if (json.errors?.length || userErrors.length) {
    return {
      ok: false,
      message:
        userErrors[0]?.message ||
        "Could not add the Approved Member tag. Please retry.",
    };
  }

  return { ok: true };
}

export async function setPrivateReserveCustomerMetafields(params: {
  admin: AdminClient;
  customerId: string;
  membershipType: MembershipType;
  applicationNumber: string;
  applicationId: string;
  memberNumber: string;
  approvedAt: string;
  /** Defaults to memberNumber — unique referral identifier without form changes */
  referralCode?: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const ns = CUSTOMER_METAFIELD_NAMESPACE;
  const referralCode = params.referralCode || params.memberNumber;
  const response = await params.admin.graphql(
    `#graphql
      mutation SetPrivateReserveCustomerMetafields($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            id
            key
          }
          userErrors {
            field
            message
            code
          }
        }
      }`,
    {
      variables: {
        metafields: [
          {
            ownerId: params.customerId,
            namespace: ns,
            key: "membership_status",
            type: "single_line_text_field",
            value: CUSTOMER_MEMBERSHIP_STATUS_APPROVED,
          },
          {
            ownerId: params.customerId,
            namespace: ns,
            key: "membership_type",
            type: "single_line_text_field",
            value: params.membershipType,
          },
          {
            ownerId: params.customerId,
            namespace: ns,
            key: "application_number",
            type: "single_line_text_field",
            value: params.applicationNumber,
          },
          {
            ownerId: params.customerId,
            namespace: ns,
            key: "application_id",
            type: "single_line_text_field",
            value: params.applicationId,
          },
          {
            ownerId: params.customerId,
            namespace: ns,
            key: "member_number",
            type: "single_line_text_field",
            value: params.memberNumber,
          },
          {
            ownerId: params.customerId,
            namespace: ns,
            key: "approved_at",
            type: "date_time",
            value: params.approvedAt,
          },
          {
            ownerId: params.customerId,
            namespace: ns,
            key: "joined_at",
            type: "date_time",
            value: params.approvedAt,
          },
          {
            ownerId: params.customerId,
            namespace: ns,
            key: "referral_code",
            type: "single_line_text_field",
            value: referralCode,
          },
        ],
      },
    },
  );

  const json: {
    data?: {
      metafieldsSet?: {
        userErrors?: Array<{ message: string }>;
      };
    };
    errors?: Array<{ message: string }>;
  } = await response.json();

  const userErrors = json.data?.metafieldsSet?.userErrors ?? [];
  if (json.errors?.length || userErrors.length) {
    return {
      ok: false,
      message:
        userErrors[0]?.message ||
        "Could not save membership metafields on the customer. Please retry.",
    };
  }

  return { ok: true };
}

/**
 * Unique member number using Shopify-native data:
 * max(existing Approved Member customer metafields, APPROVED application member_numbers) + 1
 * Then verify candidate is unused before returning.
 */
export async function nextUniqueMemberNumber(
  admin: AdminClient,
): Promise<string> {
  let max = 0;

  // From tagged customers
  let cursor: string | null = null;
  let hasNext = true;
  let pages = 0;
  while (hasNext && pages < 30) {
    const response = await admin.graphql(
      `#graphql
        query MemberNumbersFromCustomers($query: String!, $cursor: String) {
          customers(first: 100, after: $cursor, query: $query) {
            nodes {
              memberNumber: metafield(namespace: "private_reserve", key: "member_number") {
                value
              }
            }
            pageInfo { hasNextPage endCursor }
          }
        }`,
      {
        variables: {
          query: `tag:${JSON.stringify(APPROVED_MEMBER_TAG)}`,
          cursor,
        },
      },
    );
    const json: {
      data?: {
        customers?: {
          nodes?: Array<{ memberNumber?: { value?: string | null } | null }>;
          pageInfo?: { hasNextPage: boolean; endCursor: string | null };
        };
      };
    } = await response.json();

    for (const node of json.data?.customers?.nodes ?? []) {
      const match = /^XM-(\d+)$/i.exec(node.memberNumber?.value || "");
      if (match) max = Math.max(max, Number(match[1]));
    }
    hasNext = Boolean(json.data?.customers?.pageInfo?.hasNextPage);
    cursor = json.data?.customers?.pageInfo?.endCursor ?? null;
    pages += 1;
  }

  // From approved applications (Metaobject source of truth for approvals)
  cursor = null;
  hasNext = true;
  pages = 0;
  while (hasNext && pages < 20) {
    const response = await admin.graphql(
      `#graphql
        query MemberNumbersFromApplications($type: String!, $query: String!, $cursor: String) {
          metaobjects(type: $type, first: 100, after: $cursor, query: $query) {
            nodes {
              field(key: "member_number") { value }
            }
            pageInfo { hasNextPage endCursor }
          }
        }`,
      {
        variables: {
          type: "private_reserve_application",
          query: "fields.status:APPROVED",
          cursor,
        },
      },
    );
    const json: {
      data?: {
        metaobjects?: {
          nodes?: Array<{ field?: { value?: string | null } | null }>;
          pageInfo?: { hasNextPage: boolean; endCursor: string | null };
        };
      };
    } = await response.json();

    for (const node of json.data?.metaobjects?.nodes ?? []) {
      const match = /^XM-(\d+)$/i.exec(node.field?.value || "");
      if (match) max = Math.max(max, Number(match[1]));
    }
    hasNext = Boolean(json.data?.metaobjects?.pageInfo?.hasNextPage);
    cursor = json.data?.metaobjects?.pageInfo?.endCursor ?? null;
    pages += 1;
  }

  let candidate = max + 1;
  for (let i = 0; i < 25; i++) {
    const memberNumber = formatMemberNumber(candidate);
    const taken = await isMemberNumberTaken(admin, memberNumber);
    if (!taken) return memberNumber;
    candidate += 1;
  }

  // Extremely unlikely fallback
  return formatMemberNumber(Date.now() % 100000);
}

async function isMemberNumberTaken(
  admin: AdminClient,
  memberNumber: string,
): Promise<boolean> {
  const response = await admin.graphql(
    `#graphql
      query MemberNumberTaken($type: String!, $query: String!) {
        metaobjects(type: $type, first: 1, query: $query) {
          nodes { id }
        }
      }`,
    {
      variables: {
        type: "private_reserve_application",
        query: `fields.member_number:${JSON.stringify(memberNumber)}`,
      },
    },
  );

  const json: {
    data?: {
      metaobjects?: { nodes?: Array<{ id: string }> };
    };
  } = await response.json();

  if ((json.data?.metaobjects?.nodes?.length ?? 0) > 0) return true;

  // Scan Approved Member customers for matching member_number metafield
  let cursor: string | null = null;
  let hasNext = true;
  let pages = 0;
  while (hasNext && pages < 10) {
    const verify = await admin.graphql(
      `#graphql
        query VerifyMemberNumberOnCustomers($query: String!, $cursor: String) {
          customers(first: 100, after: $cursor, query: $query) {
            nodes {
              memberNumber: metafield(namespace: "private_reserve", key: "member_number") {
                value
              }
            }
            pageInfo { hasNextPage endCursor }
          }
        }`,
      {
        variables: {
          query: `tag:${JSON.stringify(APPROVED_MEMBER_TAG)}`,
          cursor,
        },
      },
    );
    const vJson: {
      data?: {
        customers?: {
          nodes?: Array<{ memberNumber?: { value?: string | null } | null }>;
          pageInfo?: { hasNextPage: boolean; endCursor: string | null };
        };
      };
    } = await verify.json();

    for (const node of vJson.data?.customers?.nodes ?? []) {
      if (node.memberNumber?.value === memberNumber) return true;
    }
    hasNext = Boolean(vJson.data?.customers?.pageInfo?.hasNextPage);
    cursor = vJson.data?.customers?.pageInfo?.endCursor ?? null;
    pages += 1;
  }

  return false;
}

/**
 * Best-effort resolve referring Approved Member from free-text application fields.
 * Prefers exact member number / referral code (XM-#####), then exact full name match.
 * Designed so a future referral_code form field can resolve the same way without schema changes.
 */
export async function findReferringApprovedMember(
  admin: AdminClient,
  referringHint: string | null | undefined,
): Promise<ShopifyCustomerSummary | null> {
  const hint = (referringHint || "").trim();
  if (!hint) return null;

  const memberNumberMatch = /^XM-\d{5}$/i.exec(hint);
  if (memberNumberMatch) {
    const byNumber = await findApprovedMemberByMemberNumber(admin, hint.toUpperCase());
    if (byNumber) return byNumber;
  }

  // Search by name among Approved Members (capped pages)
  const normalized = hint.toLowerCase();
  let cursor: string | null = null;
  let hasNext = true;
  let pages = 0;
  while (hasNext && pages < 5) {
    const response = await admin.graphql(
      `#graphql
        query FindReferringMemberByName($query: String!, $cursor: String) {
          customers(first: 50, after: $cursor, query: $query) {
            nodes {
              id
              email
              firstName
              lastName
              tags
              memberNumber: metafield(namespace: "private_reserve", key: "member_number") {
                value
              }
              referralCode: metafield(namespace: "private_reserve", key: "referral_code") {
                value
              }
            }
            pageInfo { hasNextPage endCursor }
          }
        }`,
      {
        variables: {
          query: `tag:${JSON.stringify(APPROVED_MEMBER_TAG)}`,
          cursor,
        },
      },
    );
    const json: {
      data?: {
        customers?: {
          nodes?: Array<{
            id: string;
            email?: string | null;
            firstName?: string | null;
            lastName?: string | null;
            tags?: string[];
            memberNumber?: { value?: string | null } | null;
            referralCode?: { value?: string | null } | null;
          }>;
          pageInfo?: { hasNextPage: boolean; endCursor: string | null };
        };
      };
    } = await response.json();

    for (const node of json.data?.customers?.nodes ?? []) {
      const fullName = [node.firstName, node.lastName]
        .filter(Boolean)
        .join(" ")
        .trim()
        .toLowerCase();
      const code = (node.referralCode?.value || "").toLowerCase();
      const number = (node.memberNumber?.value || "").toLowerCase();
      if (
        fullName === normalized ||
        code === normalized ||
        number === normalized
      ) {
        return {
          id: node.id,
          email: node.email ?? null,
          firstName: node.firstName ?? null,
          lastName: node.lastName ?? null,
          tags: node.tags ?? [],
          memberNumber: node.memberNumber?.value ?? null,
        };
      }
    }

    hasNext = Boolean(json.data?.customers?.pageInfo?.hasNextPage);
    cursor = json.data?.customers?.pageInfo?.endCursor ?? null;
    pages += 1;
  }

  return null;
}

export async function findApprovedMemberByMemberNumber(
  admin: AdminClient,
  memberNumber: string,
): Promise<ShopifyCustomerSummary | null> {
  const target = memberNumber.trim().toUpperCase();
  let cursor: string | null = null;
  let hasNext = true;
  let pages = 0;
  while (hasNext && pages < 15) {
    const response = await admin.graphql(
      `#graphql
        query FindMemberByNumber($query: String!, $cursor: String) {
          customers(first: 100, after: $cursor, query: $query) {
            nodes {
              id
              email
              firstName
              lastName
              tags
              memberNumber: metafield(namespace: "private_reserve", key: "member_number") {
                value
              }
              referralCode: metafield(namespace: "private_reserve", key: "referral_code") {
                value
              }
            }
            pageInfo { hasNextPage endCursor }
          }
        }`,
      {
        variables: {
          query: `tag:${JSON.stringify(APPROVED_MEMBER_TAG)}`,
          cursor,
        },
      },
    );
    const json: {
      data?: {
        customers?: {
          nodes?: Array<{
            id: string;
            email?: string | null;
            firstName?: string | null;
            lastName?: string | null;
            tags?: string[];
            memberNumber?: { value?: string | null } | null;
            referralCode?: { value?: string | null } | null;
          }>;
          pageInfo?: { hasNextPage: boolean; endCursor: string | null };
        };
      };
    } = await response.json();

    for (const node of json.data?.customers?.nodes ?? []) {
      const number = (node.memberNumber?.value || "").toUpperCase();
      const code = (node.referralCode?.value || "").toUpperCase();
      if (number === target || code === target) {
        return {
          id: node.id,
          email: node.email ?? null,
          firstName: node.firstName ?? null,
          lastName: node.lastName ?? null,
          tags: node.tags ?? [],
          memberNumber: node.memberNumber?.value ?? null,
        };
      }
    }
    hasNext = Boolean(json.data?.customers?.pageInfo?.hasNextPage);
    cursor = json.data?.customers?.pageInfo?.endCursor ?? null;
    pages += 1;
  }
  return null;
}

export type MemberListItem = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  memberNumber: string | null;
  membershipType: string | null;
  membershipStatus: string | null;
  joinedAt: string | null;
  approvedAt: string | null;
  referralCode: string | null;
  applicationNumber: string | null;
  applicationId: string | null;
  hasApprovedTag: boolean;
};

export type ListMembersParams = {
  search?: string | null;
  membershipType?: string | null;
  sort?: MemberListSort;
  /** 1-based page */
  page?: number;
  pageSize?: number;
};

export type ListMembersResult = {
  items: MemberListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

function mapCustomerToMemberListItem(node: {
  id: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  tags?: string[];
  memberNumber?: { value?: string | null } | null;
  membershipType?: { value?: string | null } | null;
  membershipStatus?: { value?: string | null } | null;
  joinedAt?: { value?: string | null } | null;
  approvedAt?: { value?: string | null } | null;
  referralCode?: { value?: string | null } | null;
  applicationNumber?: { value?: string | null } | null;
  applicationId?: { value?: string | null } | null;
}): MemberListItem {
  const firstName = node.firstName ?? null;
  const lastName = node.lastName ?? null;
  const displayName =
    [firstName, lastName].filter(Boolean).join(" ").trim() ||
    node.email ||
    "—";
  return {
    id: node.id,
    email: node.email ?? null,
    firstName,
    lastName,
    displayName,
    memberNumber: node.memberNumber?.value ?? null,
    membershipType: node.membershipType?.value ?? null,
    membershipStatus: node.membershipStatus?.value ?? null,
    joinedAt: node.joinedAt?.value ?? null,
    approvedAt: node.approvedAt?.value ?? null,
    referralCode: node.referralCode?.value ?? null,
    applicationNumber: node.applicationNumber?.value ?? null,
    applicationId: node.applicationId?.value ?? null,
    hasApprovedTag: (node.tags ?? []).includes(APPROVED_MEMBER_TAG),
  };
}

const MEMBER_NODE_FIELDS = `
  id
  email
  firstName
  lastName
  tags
  memberNumber: metafield(namespace: "private_reserve", key: "member_number") { value }
  membershipType: metafield(namespace: "private_reserve", key: "membership_type") { value }
  membershipStatus: metafield(namespace: "private_reserve", key: "membership_status") { value }
  joinedAt: metafield(namespace: "private_reserve", key: "joined_at") { value }
  approvedAt: metafield(namespace: "private_reserve", key: "approved_at") { value }
  referralCode: metafield(namespace: "private_reserve", key: "referral_code") { value }
  applicationNumber: metafield(namespace: "private_reserve", key: "application_number") { value }
  applicationId: metafield(namespace: "private_reserve", key: "application_id") { value }
`;

/**
 * Lists Approved Members from Shopify Customers (no external member DB).
 * Search/filter/sort applied in-process after a capped Shopify-native tag query.
 */
export async function listApprovedMembers(
  admin: AdminClient,
  params: ListMembersParams = {},
): Promise<ListMembersResult> {
  const pageSize = Math.min(Math.max(params.pageSize ?? 25, 5), 100);
  const page = Math.max(params.page ?? 1, 1);
  const search = (params.search || "").trim().toLowerCase();
  const typeFilter = (params.membershipType || "").trim();
  const sort = params.sort || "joined_desc";

  const queryParts = [`tag:${JSON.stringify(APPROVED_MEMBER_TAG)}`];
  if (search) {
    // Shopify customer search — best-effort; further filtered in memory
    const safe = search.replace(/"/g, "");
    if (safe) {
      queryParts.push(`(${safe})`);
    }
  }
  const shopifyQuery = queryParts.join(" ");

  const all: MemberListItem[] = [];
  let cursor: string | null = null;
  let hasNext = true;
  let pages = 0;
  const maxPages = 20;

  while (hasNext && pages < maxPages) {
    const response = await admin.graphql(
      `#graphql
        query ListApprovedMembers($query: String!, $cursor: String) {
          customers(first: 100, after: $cursor, query: $query) {
            nodes {
              ${MEMBER_NODE_FIELDS}
            }
            pageInfo { hasNextPage endCursor }
          }
        }`,
      { variables: { query: shopifyQuery, cursor } },
    );
    const json: {
      data?: {
        customers?: {
          nodes?: Array<Parameters<typeof mapCustomerToMemberListItem>[0]>;
          pageInfo?: { hasNextPage: boolean; endCursor: string | null };
        };
      };
    } = await response.json();

    for (const node of json.data?.customers?.nodes ?? []) {
      all.push(mapCustomerToMemberListItem(node));
    }
    hasNext = Boolean(json.data?.customers?.pageInfo?.hasNextPage);
    cursor = json.data?.customers?.pageInfo?.endCursor ?? null;
    pages += 1;
  }

  let filtered = all.filter((m) => m.hasApprovedTag);

  if (search) {
    filtered = filtered.filter((m) => {
      const hay = [
        m.displayName,
        m.email,
        m.memberNumber,
        m.referralCode,
        m.applicationNumber,
        m.membershipType,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(search);
    });
  }

  if (typeFilter) {
    filtered = filtered.filter((m) => m.membershipType === typeFilter);
  }

  filtered.sort((a, b) => {
    switch (sort) {
      case "name_asc":
        return a.displayName.localeCompare(b.displayName);
      case "name_desc":
        return b.displayName.localeCompare(a.displayName);
      case "member_number_asc":
        return (a.memberNumber || "").localeCompare(b.memberNumber || "");
      case "member_number_desc":
        return (b.memberNumber || "").localeCompare(a.memberNumber || "");
      case "joined_asc":
        return (a.joinedAt || a.approvedAt || "").localeCompare(
          b.joinedAt || b.approvedAt || "",
        );
      case "joined_desc":
      default:
        return (b.joinedAt || b.approvedAt || "").localeCompare(
          a.joinedAt || a.approvedAt || "",
        );
    }
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);

  return { items, page: safePage, pageSize, total, totalPages };
}

export async function getApprovedMemberById(
  admin: AdminClient,
  customerId: string,
): Promise<MemberListItem | null> {
  const response = await admin.graphql(
    `#graphql
      query GetApprovedMember($id: ID!) {
        customer(id: $id) {
          ${MEMBER_NODE_FIELDS}
        }
      }`,
    { variables: { id: customerId } },
  );
  const json: {
    data?: {
      customer?: Parameters<typeof mapCustomerToMemberListItem>[0] | null;
    };
  } = await response.json();

  const customer = json.data?.customer;
  if (!customer) return null;
  return mapCustomerToMemberListItem(customer);
}

export async function sendCustomerAccountInvite(
  admin: AdminClient,
  customerId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const response = await admin.graphql(
    `#graphql
      mutation InvitePrivateReserveMember($customerId: ID!) {
        customerSendAccountInviteEmail(customerId: $customerId) {
          customer { id }
          userErrors { message }
        }
      }`,
    { variables: { customerId } },
  );

  const json: {
    data?: {
      customerSendAccountInviteEmail?: {
        userErrors?: Array<{ message: string }>;
      };
    };
    errors?: Array<{ message: string }>;
  } = await response.json();

  const userErrors =
    json.data?.customerSendAccountInviteEmail?.userErrors ?? [];
  if (json.errors?.length || userErrors.length) {
    return {
      ok: false,
      message:
        userErrors[0]?.message ||
        "Membership was saved, but the account invite email could not be sent.",
    };
  }

  return { ok: true };
}

export function assertMembershipType(
  value: string | null | undefined,
): MembershipType | null {
  if (!value) return null;
  return isMembershipType(value) ? value : null;
}

