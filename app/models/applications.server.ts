import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { z } from "zod";

import {
  ACTIVE_APPLICATION_STATUSES,
  DEFAULT_APPLICATION_STATUS,
  EXPECTED_FORM_TYPE,
  isMembershipType,
  MEMBERSHIP_TYPES,
  METAOBJECT_TYPE,
  YES_NO_VALUES,
  type ApplicationStatus,
  APPLICATION_STATUSES,
} from "../constants/private-reserve";
import {
  addApprovedMemberTag,
  assertMembershipType,
  createCustomer,
  customerAdminUrl,
  findCustomerByEmail,
  findReferringApprovedMember,
  nextUniqueMemberNumber,
  protectedCustomerDataMessage,
  setPrivateReserveCustomerMetafields,
} from "./customers.server";
import { sendModularApprovalEmail } from "../services/email";

type AdminClient = AdminApiContext;

export type DashboardCounts = Record<ApplicationStatus, number>;

export type ApplicationFields = {
  applicationNumber: string | null;
  fullName: string | null;
  email: string | null;
  membershipType: string | null;
  howDidHear: string | null;
  membershipInterest: string | null;
  favoriteCigarBrands: string | null;
  attendedXmEvent: string | null;
  hasMemberReferral: string | null;
  referringMemberName: string | null;
  referralRelationship: string | null;
  referralRelationshipDuration: string | null;
  socialProfile: string | null;
  additionalNotes: string | null;
  formType: string | null;
  requestType: string | null;
  sourcePage: string | null;
  adminAction: string | null;
  status: string | null;
  adminNotes: string | null;
  shopifyCustomerId: string | null;
  memberNumber: string | null;
  referringCustomerId: string | null;
  referringMemberNumber: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  waitlistedAt: string | null;
  approvalEmailSentAt: string | null;
};

export type ApplicationRecord = ApplicationFields & {
  id: string;
  handle: string;
  updatedAt?: string | null;
};

const optionalText = z
  .string()
  .trim()
  .max(5000)
  .transform((v) => (v.length ? v : undefined));

const optionalYesNo = z
  .string()
  .trim()
  .transform((v) => (v.length ? v : undefined))
  .refine((v) => v == null || (YES_NO_VALUES as readonly string[]).includes(v), {
    message: "Invalid select value",
  });

export const storefrontApplicationSchema = z.object({
  full_name: z.string().trim().min(1, "Please enter your full name.").max(200),
  email: z
    .string()
    .trim()
    .email("Please enter a valid email address.")
    .max(255)
    .transform((v) => v.toLowerCase()),
  membership_type: z
    .string()
    .trim()
    .min(1, "Please select a membership type.")
    .refine((v) => isMembershipType(v), {
      message: "Please select a valid membership type.",
    }),
  how_did_hear: optionalText,
  membership_interest: optionalText,
  favorite_cigar_brands: optionalText,
  attended_xm_event: optionalYesNo,
  has_member_referral: optionalYesNo,
  referring_member_name: optionalText,
  referral_relationship: optionalText,
  referral_relationship_duration: optionalText,
  social_profile: optionalText,
  additional_notes: optionalText,
  form_type: z
    .string()
    .trim()
    .refine((v) => v === EXPECTED_FORM_TYPE, {
      message: "Invalid application form.",
    }),
  request_type: optionalText,
  source_page: optionalText,
  // Informational only — never executed
  admin_action: optionalText,
});

export type StorefrontApplicationInput = z.infer<
  typeof storefrontApplicationSchema
>;

function emptyCounts(): DashboardCounts {
  return {
    PENDING: 0,
    UNDER_REVIEW: 0,
    APPROVED: 0,
    REJECTED: 0,
    WAITLISTED: 0,
  };
}

function sanitizeText(value?: string | null): string | null {
  if (value == null) return null;
  const cleaned = value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim();
  return cleaned.length ? cleaned : null;
}

function formatApplicationNumber(value: number): string {
  return `XM-${String(value).padStart(6, "0")}`;
}

function fieldValue(
  fields: Array<{ key: string; value?: string | null } | null> | undefined,
  key: string,
): string | null {
  const match = fields?.find((f) => f?.key === key);
  return match?.value ?? null;
}

function mapApplicationNode(node: {
  id: string;
  handle: string;
  updatedAt?: string;
  fields?: Array<{ key: string; value?: string | null } | null>;
}): ApplicationRecord {
  const fields = node.fields;
  return {
    id: node.id,
    handle: node.handle,
    updatedAt: node.updatedAt ?? null,
    applicationNumber: fieldValue(fields, "application_number"),
    fullName: fieldValue(fields, "full_name"),
    email: fieldValue(fields, "email"),
    membershipType: fieldValue(fields, "membership_type"),
    howDidHear: fieldValue(fields, "how_did_hear"),
    membershipInterest: fieldValue(fields, "membership_interest"),
    favoriteCigarBrands: fieldValue(fields, "favorite_cigar_brands"),
    attendedXmEvent: fieldValue(fields, "attended_xm_event"),
    hasMemberReferral: fieldValue(fields, "has_member_referral"),
    referringMemberName: fieldValue(fields, "referring_member_name"),
    referralRelationship: fieldValue(fields, "referral_relationship"),
    referralRelationshipDuration: fieldValue(
      fields,
      "referral_relationship_duration",
    ),
    socialProfile: fieldValue(fields, "social_profile"),
    additionalNotes: fieldValue(fields, "additional_notes"),
    formType: fieldValue(fields, "form_type"),
    requestType: fieldValue(fields, "request_type"),
    sourcePage: fieldValue(fields, "source_page"),
    adminAction: fieldValue(fields, "admin_action"),
    status: fieldValue(fields, "status"),
    adminNotes: fieldValue(fields, "admin_notes"),
    shopifyCustomerId: fieldValue(fields, "shopify_customer_id"),
    memberNumber: fieldValue(fields, "member_number"),
    referringCustomerId: fieldValue(fields, "referring_customer_id"),
    referringMemberNumber: fieldValue(fields, "referring_member_number"),
    submittedAt: fieldValue(fields, "submitted_at"),
    approvedAt: fieldValue(fields, "approved_at"),
    rejectedAt: fieldValue(fields, "rejected_at"),
    waitlistedAt: fieldValue(fields, "waitlisted_at"),
    approvalEmailSentAt: fieldValue(fields, "approval_email_sent_at"),
  };
}

/**
 * Count applications by status from Metaobject entries.
 * Uses filterable `status` field queries — no local application DB.
 */
export async function getDashboardCounts(
  admin: AdminClient,
): Promise<DashboardCounts> {
  const counts = emptyCounts();

  await Promise.all(
    APPLICATION_STATUSES.map(async (status) => {
      counts[status] = await countApplicationsByStatus(admin, status);
    }),
  );

  return counts;
}

async function countApplicationsByStatus(
  admin: AdminClient,
  status: ApplicationStatus,
): Promise<number> {
  let total = 0;
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const response = await admin.graphql(
      `#graphql
        query CountApplications($type: String!, $query: String!, $cursor: String) {
          metaobjects(
            type: $type
            first: 100
            after: $cursor
            query: $query
          ) {
            nodes {
              id
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }`,
      {
        variables: {
          type: METAOBJECT_TYPE,
          query: `fields.status:${status}`,
          cursor,
        },
      },
    );

    const json: {
      data?: {
        metaobjects?: {
          nodes?: Array<{ id: string }>;
          pageInfo?: { hasNextPage: boolean; endCursor: string | null };
        };
      };
      errors?: unknown[];
    } = await response.json();

    if (json.errors?.length) {
      return 0;
    }

    const connection = json.data?.metaobjects;
    total += connection?.nodes?.length ?? 0;
    hasNextPage = Boolean(connection?.pageInfo?.hasNextPage);
    cursor = connection?.pageInfo?.endCursor ?? null;

    if (!hasNextPage) break;
  }

  return total;
}

export async function listRecentApplications(
  admin: AdminClient,
  limit = 10,
): Promise<
  Array<{
    id: string;
    handle: string;
    applicationNumber: string | null;
    fullName: string | null;
    email: string | null;
    status: string | null;
    membershipType: string | null;
    submittedAt: string | null;
  }>
> {
  const response = await admin.graphql(
    `#graphql
      query RecentApplications($type: String!, $first: Int!) {
        metaobjects(type: $type, first: $first, sortKey: "updated_at", reverse: true) {
          nodes {
            id
            handle
            fields {
              key
              value
            }
          }
        }
      }`,
    {
      variables: {
        type: METAOBJECT_TYPE,
        first: Math.min(50, Math.max(1, limit)),
      },
    },
  );

  const json: {
    data?: {
      metaobjects?: {
        nodes?: Array<{
          id: string;
          handle: string;
          fields?: Array<{ key: string; value?: string | null }>;
        }>;
      };
    };
    errors?: unknown[];
  } = await response.json();

  if (json.errors?.length || !json.data?.metaobjects?.nodes) {
    return [];
  }

  return json.data.metaobjects.nodes.map((node) => {
    const mapped = mapApplicationNode(node);
    return {
      id: mapped.id,
      handle: mapped.handle,
      applicationNumber: mapped.applicationNumber,
      fullName: mapped.fullName,
      email: mapped.email,
      status: mapped.status,
      membershipType: mapped.membershipType,
      submittedAt: mapped.submittedAt,
    };
  });
}

export async function getApplicationById(
  admin: AdminClient,
  id: string,
): Promise<ApplicationRecord | null> {
  const response = await admin.graphql(
    `#graphql
      query ApplicationById($id: ID!) {
        metaobject(id: $id) {
          id
          handle
          type
          updatedAt
          fields {
            key
            value
          }
        }
      }`,
    { variables: { id } },
  );

  const json: {
    data?: {
      metaobject?: {
        id: string;
        handle: string;
        type: string;
        updatedAt?: string;
        fields?: Array<{ key: string; value?: string | null }>;
      } | null;
    };
  } = await response.json();

  const node = json.data?.metaobject;
  if (!node || node.type !== METAOBJECT_TYPE) return null;
  return mapApplicationNode(node);
}

export async function findActiveApplicationByEmail(
  admin: AdminClient,
  email: string,
): Promise<ApplicationRecord | null> {
  const normalized = email.trim().toLowerCase();
  const response = await admin.graphql(
    `#graphql
      query ActiveApplicationByEmail($type: String!, $query: String!) {
        metaobjects(type: $type, first: 25, query: $query) {
          nodes {
            id
            handle
            fields {
              key
              value
            }
          }
        }
      }`,
    {
      variables: {
        type: METAOBJECT_TYPE,
        query: `fields.email:${JSON.stringify(normalized)}`,
      },
    },
  );

  const json: {
    data?: {
      metaobjects?: {
        nodes?: Array<{
          id: string;
          handle: string;
          fields?: Array<{ key: string; value?: string | null }>;
        }>;
      };
    };
  } = await response.json();

  const nodes = json.data?.metaobjects?.nodes ?? [];
  for (const node of nodes) {
    const mapped = mapApplicationNode(node);
    if (
      mapped.email?.toLowerCase() === normalized &&
      mapped.status &&
      (ACTIVE_APPLICATION_STATUSES as readonly string[]).includes(mapped.status)
    ) {
      return mapped;
    }
  }

  return null;
}

async function nextApplicationNumber(admin: AdminClient): Promise<string> {
  // Scan recent applications for max XM-###### — Metaobjects are source of truth
  let max = 0;
  let cursor: string | null = null;
  let hasNextPage = true;
  let pages = 0;

  while (hasNextPage && pages < 20) {
    const response = await admin.graphql(
      `#graphql
        query ApplicationNumbers($type: String!, $cursor: String) {
          metaobjects(type: $type, first: 100, after: $cursor) {
            nodes {
              field(key: "application_number") { value }
            }
            pageInfo { hasNextPage endCursor }
          }
        }`,
      { variables: { type: METAOBJECT_TYPE, cursor } },
    );

    const json: {
      data?: {
        metaobjects?: {
          nodes?: Array<{ field?: { value?: string | null } | null }>;
          pageInfo?: { hasNextPage: boolean; endCursor: string | null };
        };
      };
    } = await response.json();

    const connection = json.data?.metaobjects;
    for (const node of connection?.nodes ?? []) {
      const value = node.field?.value || "";
      const match = /^XM-(\d+)$/i.exec(value);
      if (match) {
        max = Math.max(max, Number(match[1]));
      }
    }

    hasNextPage = Boolean(connection?.pageInfo?.hasNextPage);
    cursor = connection?.pageInfo?.endCursor ?? null;
    pages += 1;
    if (!hasNextPage) break;
  }

  return formatApplicationNumber(max + 1);
}

function buildMetaobjectFields(
  input: StorefrontApplicationInput,
  applicationNumber: string,
  submittedAt: string,
) {
  const entries: Array<{ key: string; value: string }> = [
    { key: "application_number", value: applicationNumber },
    { key: "full_name", value: input.full_name },
    { key: "email", value: input.email },
    { key: "membership_type", value: input.membership_type },
    { key: "status", value: DEFAULT_APPLICATION_STATUS },
    { key: "submitted_at", value: submittedAt },
    { key: "form_type", value: input.form_type },
  ];

  const optionalPairs: Array<[string, string | undefined | null]> = [
    ["how_did_hear", input.how_did_hear],
    ["membership_interest", input.membership_interest],
    ["favorite_cigar_brands", input.favorite_cigar_brands],
    ["attended_xm_event", input.attended_xm_event],
    ["has_member_referral", input.has_member_referral],
    ["referring_member_name", input.referring_member_name],
    ["referral_relationship", input.referral_relationship],
    ["referral_relationship_duration", input.referral_relationship_duration],
    ["social_profile", input.social_profile],
    ["additional_notes", input.additional_notes],
    ["request_type", input.request_type],
    ["source_page", input.source_page],
    ["admin_action", input.admin_action],
  ];

  for (const [key, value] of optionalPairs) {
    const cleaned = sanitizeText(value);
    if (cleaned) entries.push({ key, value: cleaned });
  }

  return entries;
}

export type CreateApplicationResult =
  | {
      ok: true;
      applicationNumber: string;
      id: string;
      handle: string;
    }
  | {
      ok: false;
      code: "duplicate" | "validation" | "api";
      message: string;
      fieldErrors?: Record<string, string>;
    };

/**
 * Storefront-safe create. Always PENDING. Never trusts client status/customer fields.
 */
export async function createStorefrontApplication(
  admin: AdminClient,
  rawInput: unknown,
): Promise<CreateApplicationResult> {
  const parsed = storefrontApplicationSchema.safeParse(rawInput);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] ? String(issue.path[0]) : "form";
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return {
      ok: false,
      code: "validation",
      message: Object.values(fieldErrors)[0] || "Please check your application.",
      fieldErrors,
    };
  }

  // Defense in depth — membership type whitelist
  if (!MEMBERSHIP_TYPES.includes(parsed.data.membership_type as (typeof MEMBERSHIP_TYPES)[number])) {
    return {
      ok: false,
      code: "validation",
      message: "Please select a valid membership type.",
    };
  }

  const existing = await findActiveApplicationByEmail(admin, parsed.data.email);
  if (existing) {
    return {
      ok: false,
      code: "duplicate",
      message:
        "We already have an application associated with this email address.",
    };
  }

  const applicationNumber = await nextApplicationNumber(admin);
  const submittedAt = new Date().toISOString();
  const fields = buildMetaobjectFields(
    parsed.data,
    applicationNumber,
    submittedAt,
  );

  const handle = applicationNumber.toLowerCase();

  const response = await admin.graphql(
    `#graphql
      mutation CreatePrivateReserveApplication($metaobject: MetaobjectCreateInput!) {
        metaobjectCreate(metaobject: $metaobject) {
          metaobject {
            id
            handle
            field(key: "application_number") { value }
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
        metaobject: {
          type: METAOBJECT_TYPE,
          handle,
          fields,
        },
      },
    },
  );

  const json: {
    data?: {
      metaobjectCreate?: {
        metaobject?: {
          id: string;
          handle: string;
          field?: { value?: string | null } | null;
        } | null;
        userErrors?: Array<{ message: string }>;
      };
    };
    errors?: Array<{ message: string }>;
  } = await response.json();

  const userErrors = json.data?.metaobjectCreate?.userErrors ?? [];
  if (json.errors?.length || userErrors.length) {
    const detail = [
      ...(json.errors || []).map((e) => e.message),
      ...userErrors.map((e) => e.message),
    ]
      .filter(Boolean)
      .join("; ");
    console.error("[xm-applications] metaobjectCreate failed", {
      errors: json.errors,
      userErrors,
      type: METAOBJECT_TYPE,
      handle,
      fieldKeys: fields.map((f) => f.key),
    });
    return {
      ok: false,
      code: "api",
      message: detail
        ? `Application could not be saved: ${detail}`
        : "We could not submit your application right now. Please try again shortly.",
    };
  }

  const created = json.data?.metaobjectCreate?.metaobject;
  if (!created?.id) {
    console.error("[xm-applications] metaobjectCreate returned empty", {
      json,
      type: METAOBJECT_TYPE,
      handle,
    });
    return {
      ok: false,
      code: "api",
      message:
        "We could not submit your application right now. Please try again shortly.",
    };
  }

  return {
    ok: true,
    applicationNumber:
      created.field?.value || applicationNumber,
    id: created.id,
    handle: created.handle,
  };
}

/**
 * Map contact[...] form fields from the theme into Metaobject keys.
 */
export function mapContactFormToApplicationInput(
  formData: FormData,
): Record<string, string> {
  const get = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };

  return {
    full_name: get("contact[name]"),
    email: get("contact[email]"),
    membership_type: get("contact[Membership type]"),
    how_did_hear: get("contact[How did you hear about XM]"),
    membership_interest: get("contact[What interests you about membership]"),
    favorite_cigar_brands: get("contact[Favorite cigar brands]"),
    attended_xm_event: get("contact[Attended XM event]"),
    has_member_referral: get("contact[Member referral]"),
    referring_member_name: get("contact[Referring member name]"),
    referral_relationship: get("contact[Relationship to referring member]"),
    referral_relationship_duration: get("contact[How long known]"),
    social_profile: get("contact[Social profile]"),
    additional_notes: get("contact[body]"),
    form_type: get("contact[form_type]"),
    request_type: get("contact[request_type]"),
    source_page: get("contact[source_page]"),
    admin_action: get("contact[admin_action]"),
  };
}

export type AdminActionResult =
  | {
      ok: true;
      message: string;
      application: ApplicationRecord;
      inviteWarning?: string;
      customerAdminUrl?: string;
    }
  | { ok: false; message: string };

const APPROVABLE: ApplicationStatus[] = [
  "PENDING",
  "UNDER_REVIEW",
  "WAITLISTED",
];

async function updateApplicationFields(
  admin: AdminClient,
  id: string,
  fields: Array<{ key: string; value: string }>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const response = await admin.graphql(
    `#graphql
      mutation UpdatePrivateReserveApplication($id: ID!, $metaobject: MetaobjectUpdateInput!) {
        metaobjectUpdate(id: $id, metaobject: $metaobject) {
          metaobject { id }
          userErrors { field message code }
        }
      }`,
    {
      variables: {
        id,
        metaobject: { fields },
      },
    },
  );

  const json: {
    data?: {
      metaobjectUpdate?: {
        userErrors?: Array<{ message: string }>;
      };
    };
    errors?: Array<{ message: string }>;
  } = await response.json();

  const userErrors = json.data?.metaobjectUpdate?.userErrors ?? [];
  if (json.errors?.length || userErrors.length) {
    return {
      ok: false,
      message:
        userErrors[0]?.message ||
        "Could not update the application. Please retry.",
    };
  }
  return { ok: true };
}

function appendAuditNote(
  existing: string | null | undefined,
  line: string,
): string {
  const stamp = new Date().toISOString();
  const entry = `[${stamp}] ${line}`;
  const prev = (existing || "").trim();
  return prev ? `${prev}\n${entry}` : entry;
}

export async function markApplicationUnderReview(params: {
  admin: AdminClient;
  applicationId: string;
  performedBy: string;
}): Promise<AdminActionResult> {
  const application = await getApplicationById(
    params.admin,
    params.applicationId,
  );
  if (!application) {
    return { ok: false, message: "Application not found." };
  }

  if (application.status === "UNDER_REVIEW") {
    return {
      ok: true,
      message: "Application is already under review.",
      application,
    };
  }

  if (application.status === "APPROVED" || application.status === "REJECTED") {
    return {
      ok: false,
      message: `Cannot mark ${application.status} applications under review.`,
    };
  }

  const notes = appendAuditNote(
    application.adminNotes,
    `UNDER_REVIEW by ${params.performedBy}`,
  );

  const updated = await updateApplicationFields(params.admin, application.id, [
    { key: "status", value: "UNDER_REVIEW" },
    { key: "admin_notes", value: notes },
  ]);
  if (!updated.ok) return updated;

  const fresh = await getApplicationById(params.admin, application.id);
  return {
    ok: true,
    message: "Marked under review.",
    application: fresh || application,
  };
}

export async function rejectApplication(params: {
  admin: AdminClient;
  applicationId: string;
  performedBy: string;
}): Promise<AdminActionResult> {
  const application = await getApplicationById(
    params.admin,
    params.applicationId,
  );
  if (!application) {
    return { ok: false, message: "Application not found." };
  }

  if (application.status === "REJECTED") {
    return {
      ok: true,
      message: "Application is already rejected.",
      application,
    };
  }

  if (application.status === "APPROVED") {
    return {
      ok: false,
      message:
        "Approved applications cannot be rejected from this screen. Revoke membership separately if needed.",
    };
  }

  const now = new Date().toISOString();
  const notes = appendAuditNote(
    application.adminNotes,
    `REJECTED by ${params.performedBy}`,
  );

  const updated = await updateApplicationFields(params.admin, application.id, [
    { key: "status", value: "REJECTED" },
    { key: "rejected_at", value: now },
    { key: "admin_notes", value: notes },
  ]);
  if (!updated.ok) return updated;

  const fresh = await getApplicationById(params.admin, application.id);
  return {
    ok: true,
    message: "Application rejected.",
    application: fresh || application,
  };
}

export async function waitlistApplication(params: {
  admin: AdminClient;
  applicationId: string;
  performedBy: string;
}): Promise<AdminActionResult> {
  const application = await getApplicationById(
    params.admin,
    params.applicationId,
  );
  if (!application) {
    return { ok: false, message: "Application not found." };
  }

  if (application.status === "WAITLISTED") {
    return {
      ok: true,
      message: "Application is already waitlisted.",
      application,
    };
  }

  if (application.status === "APPROVED" || application.status === "REJECTED") {
    return {
      ok: false,
      message: `Cannot waitlist ${application.status} applications.`,
    };
  }

  const now = new Date().toISOString();
  const notes = appendAuditNote(
    application.adminNotes,
    `WAITLISTED by ${params.performedBy}`,
  );

  const updated = await updateApplicationFields(params.admin, application.id, [
    { key: "status", value: "WAITLISTED" },
    { key: "waitlisted_at", value: now },
    { key: "admin_notes", value: notes },
  ]);
  if (!updated.ok) return updated;

  const fresh = await getApplicationById(params.admin, application.id);
  return {
    ok: true,
    message: "Application waitlisted.",
    application: fresh || application,
  };
}

export async function approveApplication(params: {
  admin: AdminClient;
  applicationId: string;
  performedBy: string;
  shop: string;
}): Promise<AdminActionResult> {
  const application = await getApplicationById(
    params.admin,
    params.applicationId,
  );
  if (!application) {
    return { ok: false, message: "Application not found." };
  }

  // Idempotent: already approved with customer + member number
  if (
    application.status === "APPROVED" &&
    application.shopifyCustomerId &&
    application.memberNumber
  ) {
    return {
      ok: true,
      message: "Application is already approved. No duplicate updates were made.",
      application,
      customerAdminUrl: customerAdminUrl(
        params.shop,
        application.shopifyCustomerId,
      ),
    };
  }

  if (
    application.status &&
    !APPROVABLE.includes(application.status as ApplicationStatus) &&
    application.status !== "APPROVED"
  ) {
    return {
      ok: false,
      message: `Application status ${application.status} is not eligible for approval.`,
    };
  }

  if (!application.email) {
    return { ok: false, message: "Application is missing an email address." };
  }

  const membershipType = assertMembershipType(application.membershipType);
  if (!membershipType) {
    return {
      ok: false,
      message:
        "Application has an invalid membership type. Fix the Metaobject membership_type before approving.",
    };
  }

  if (!application.fullName) {
    return { ok: false, message: "Application is missing a full name." };
  }

  // Find or create customer (never duplicate)
  let customer;
  try {
    customer = await findCustomerByEmail(params.admin, application.email);
  } catch (error) {
    return {
      ok: false,
      message: protectedCustomerDataMessage(error),
    };
  }
  if (!customer) {
    const created = await createCustomer({
      admin: params.admin,
      email: application.email,
      fullName: application.fullName,
    });
    if (!created.ok) return { ok: false, message: created.message };
    customer = created.customer;
  }

  // Reuse existing member number on retry / partial approval
  const memberNumber =
    application.memberNumber ||
    customer.memberNumber ||
    (await nextUniqueMemberNumber(params.admin));

  const approvedAt =
    application.approvedAt || new Date().toISOString();

  const tagResult = await addApprovedMemberTag(params.admin, customer.id);
  if (!tagResult.ok) return { ok: false, message: tagResult.message };

  const metafieldResult = await setPrivateReserveCustomerMetafields({
    admin: params.admin,
    customerId: customer.id,
    membershipType,
    applicationNumber: application.applicationNumber || "",
    applicationId: application.id,
    memberNumber,
    approvedAt,
    referralCode: memberNumber,
  });
  if (!metafieldResult.ok) {
    return { ok: false, message: metafieldResult.message };
  }

  // Best-effort referral association (free-text → Approved Member). Does not block approval.
  let referringCustomerId = application.referringCustomerId;
  let referringMemberNumber = application.referringMemberNumber;
  if (
    application.hasMemberReferral === "Yes" &&
    !referringCustomerId &&
    application.referringMemberName
  ) {
    const referrer = await findReferringApprovedMember(
      params.admin,
      application.referringMemberName,
    );
    if (referrer) {
      referringCustomerId = referrer.id;
      referringMemberNumber = referrer.memberNumber;
    }
  }

  const notes = appendAuditNote(
    application.adminNotes,
    `APPROVED by ${params.performedBy} · member ${memberNumber} · customer ${customer.id}${
      referringCustomerId
        ? ` · referred by ${referringMemberNumber || referringCustomerId}`
        : ""
    }`,
  );

  const approvalFields: Array<{ key: string; value: string }> = [
    { key: "status", value: "APPROVED" },
    { key: "shopify_customer_id", value: customer.id },
    { key: "member_number", value: memberNumber },
    { key: "approved_at", value: approvedAt },
    { key: "admin_notes", value: notes },
  ];
  if (referringCustomerId) {
    approvalFields.push({
      key: "referring_customer_id",
      value: referringCustomerId,
    });
  }
  if (referringMemberNumber) {
    approvalFields.push({
      key: "referring_member_number",
      value: referringMemberNumber,
    });
  }

  const updated = await updateApplicationFields(
    params.admin,
    application.id,
    approvalFields,
  );
  if (!updated.ok) {
    return {
      ok: false,
      message: `${updated.message} Customer may already have membership data — retry to finish linking the application.`,
    };
  }

  // Approval notification (modular). Skip if already sent unless this is a fresh approve without timestamp.
  let inviteWarning: string | undefined;
  const alreadyEmailed = Boolean(application.approvalEmailSentAt);
  if (!alreadyEmailed) {
    const emailResult = await sendModularApprovalEmail({
      admin: params.admin,
      payload: {
        to: application.email,
        customerId: customer.id,
        fullName: application.fullName,
        membershipType,
        memberNumber,
        shopDomain: params.shop,
        ctaLabel: "Activate Your Membership",
      },
    });

    if (emailResult.ok && (emailResult.sent || emailResult.skipped)) {
      const sentAt = new Date().toISOString();
      const emailNotes = appendAuditNote(
        notes,
        `APPROVAL_EMAIL via ${emailResult.provider}${emailResult.skipped ? " (skipped/existing account)" : " (sent)"}`,
      );
      await updateApplicationFields(params.admin, application.id, [
        { key: "approval_email_sent_at", value: sentAt },
        { key: "admin_notes", value: emailNotes },
      ]);
    } else if (!emailResult.ok) {
      inviteWarning =
        emailResult.message ||
        "Membership was saved, but the approval notification could not be sent. Use Resend Approval Email.";
    }
  }

  const fresh = await getApplicationById(params.admin, application.id);

  return {
    ok: true,
    message: alreadyEmailed
      ? "Application approved. Approval email was already sent earlier (not re-sent)."
      : "Application approved. Customer tagged as Approved Member.",
    application: fresh || application,
    inviteWarning,
    customerAdminUrl: customerAdminUrl(params.shop, customer.id),
  };
}

/**
 * Explicit admin resend — only path that re-sends after approval_email_sent_at is set.
 */
export async function resendApprovalEmail(params: {
  admin: AdminClient;
  applicationId: string;
  performedBy: string;
  shop: string;
}): Promise<AdminActionResult> {
  const application = await getApplicationById(
    params.admin,
    params.applicationId,
  );
  if (!application) {
    return { ok: false, message: "Application not found." };
  }
  if (application.status !== "APPROVED") {
    return {
      ok: false,
      message: "Only approved applications can resend the approval email.",
    };
  }
  if (!application.shopifyCustomerId || !application.email) {
    return {
      ok: false,
      message: "Application is missing customer or email. Approve again first.",
    };
  }
  const membershipType = assertMembershipType(application.membershipType);
  if (!membershipType || !application.memberNumber) {
    return {
      ok: false,
      message: "Application is missing membership type or member number.",
    };
  }

  const emailResult = await sendModularApprovalEmail({
    admin: params.admin,
    payload: {
      to: application.email,
      customerId: application.shopifyCustomerId,
      fullName: application.fullName || "",
      membershipType,
      memberNumber: application.memberNumber,
      shopDomain: params.shop,
      ctaLabel: "Activate Your Membership",
    },
  });

  if (!emailResult.ok) {
    return {
      ok: false,
      message:
        emailResult.message ||
        "Could not resend the approval notification. Please retry.",
    };
  }

  const sentAt = new Date().toISOString();
  const notes = appendAuditNote(
    application.adminNotes,
    `APPROVAL_EMAIL_RESEND by ${params.performedBy} via ${emailResult.provider}${emailResult.skipped ? " (skipped/existing account)" : ""}`,
  );
  await updateApplicationFields(params.admin, application.id, [
    { key: "approval_email_sent_at", value: sentAt },
    { key: "admin_notes", value: notes },
  ]);

  const fresh = await getApplicationById(params.admin, application.id);
  return {
    ok: true,
    message: emailResult.skipped
      ? "Customer already has account access. They can sign in — no new invite was required."
      : "Approval email resent.",
    application: fresh || application,
    customerAdminUrl: customerAdminUrl(params.shop, application.shopifyCustomerId),
  };
}
