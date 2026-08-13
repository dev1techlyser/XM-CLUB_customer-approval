import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

import {
  APPLICATION_STATUSES,
  CUSTOMER_METAFIELD_NAMESPACE,
  MEMBERSHIP_TYPES,
  METAOBJECT_DISPLAY_NAME,
  METAOBJECT_TYPE,
  PRODUCT_MEMBERS_ONLY_KEY,
  PRODUCT_METAFIELD_NAMESPACE,
} from "../constants/private-reserve";

type AdminClient = AdminApiContext;

type DefinitionResult = {
  ok: boolean;
  created: boolean;
  skipped: boolean;
  id?: string;
  errors: string[];
};

function choicesValidation(values: readonly string[]) {
  return {
    name: "choices",
    value: JSON.stringify(values),
  };
}

function textField(
  key: string,
  name: string,
  opts: {
    type?: "single_line_text_field" | "multi_line_text_field";
    required?: boolean;
    description?: string;
    filterable?: boolean;
    choices?: readonly string[];
  } = {},
) {
  const type = opts.type ?? "single_line_text_field";
  const field: Record<string, unknown> = {
    key,
    name,
    type,
    required: Boolean(opts.required),
    description: opts.description || undefined,
  };

  if (opts.filterable) {
    field.capabilities = {
      adminFilterable: { enabled: true },
    };
  }

  if (opts.choices?.length) {
    field.validations = [choicesValidation(opts.choices)];
  }

  return field;
}

function dateTimeField(
  key: string,
  name: string,
  opts: { required?: boolean; description?: string } = {},
) {
  return {
    key,
    name,
    type: "date_time",
    required: Boolean(opts.required),
    description: opts.description || undefined,
  };
}

export function buildApplicationMetaobjectDefinition() {
  return {
    name: METAOBJECT_DISPLAY_NAME,
    type: METAOBJECT_TYPE,
    description:
      "Membership applications for the XM Private Reserve Society. App database = this metaobject.",
    // Merchant-owned type (no $app: prefix): omit admin access — API rejects it on 2026-01+
    access: {
      storefront: "NONE",
    },
    displayNameKey: "application_number",
    fieldDefinitions: [
      textField("application_number", "Application number", {
        required: true,
        filterable: true,
        description: "Format XM-000001",
      }),
      textField("full_name", "Full name", { required: true, filterable: true }),
      textField("email", "Email", { required: true, filterable: true }),
      textField("membership_type", "Membership type", {
        required: true,
        filterable: true,
        choices: MEMBERSHIP_TYPES,
      }),
      textField("how_did_hear", "How did you hear about XM?"),
      textField("membership_interest", "What interests you about membership?", {
        type: "multi_line_text_field",
      }),
      textField("favorite_cigar_brands", "Favorite cigar brands"),
      textField("attended_xm_event", "Attended XM event"),
      textField("has_member_referral", "Has member referral", {
        filterable: true,
      }),
      textField("referring_member_name", "Referring member name"),
      textField("referral_relationship", "Referral relationship"),
      textField(
        "referral_relationship_duration",
        "How long known referring member",
      ),
      textField("social_profile", "Instagram or LinkedIn"),
      textField("additional_notes", "Additional notes", {
        type: "multi_line_text_field",
      }),
      textField("form_type", "Form type"),
      textField("request_type", "Request type"),
      textField("source_page", "Source page"),
      textField("admin_action", "Admin action hint"),
      textField("status", "Status", {
        required: true,
        filterable: true,
        choices: APPLICATION_STATUSES,
        description: "New applications must start as PENDING",
      }),
      textField("admin_notes", "Admin notes", {
        type: "multi_line_text_field",
      }),
      textField("shopify_customer_id", "Shopify customer ID"),
      textField("member_number", "Member number"),
      textField("referring_customer_id", "Referring customer ID", {
        description:
          "Best-effort link to Approved Member who referred this applicant",
      }),
      textField("referring_member_number", "Referring member number", {
        description: "Resolved referring member number when association succeeds",
      }),
      dateTimeField("submitted_at", "Submitted at"),
      dateTimeField("approved_at", "Approved at"),
      dateTimeField("rejected_at", "Rejected at"),
      dateTimeField("waitlisted_at", "Waitlisted at"),
      dateTimeField(
        "approval_email_sent_at",
        "Approval email sent at",
        {
          description:
            "Prevents duplicate approval emails unless admin chooses Resend",
        },
      ),
    ],
  };
}

const CUSTOMER_METAFIELD_DEFINITIONS: Array<{
  key: string;
  name: string;
  type: string;
  description?: string;
}> = [
  {
    key: "membership_status",
    name: "Membership status",
    type: "single_line_text_field",
    description: "e.g. APPROVED, PENDING",
  },
  {
    key: "membership_type",
    name: "Membership type",
    type: "single_line_text_field",
    description: "Founding Member | Reserve Member | Collector Member",
  },
  {
    key: "member_number",
    name: "Member number",
    type: "single_line_text_field",
  },
  {
    key: "application_number",
    name: "Application number",
    type: "single_line_text_field",
  },
  {
    key: "application_id",
    name: "Application metaobject ID",
    type: "single_line_text_field",
  },
  {
    key: "approved_at",
    name: "Approved at",
    type: "date_time",
  },
  {
    key: "joined_at",
    name: "Joined at",
    type: "date_time",
  },
  {
    key: "referral_code",
    name: "Referral code",
    type: "single_line_text_field",
    description:
      "Unique referral identifier (defaults to member number). Future custom codes without form changes.",
  },
];

const PRODUCT_METAFIELD_DEFINITIONS: Array<{
  key: string;
  name: string;
  type: string;
  description?: string;
}> = [
  {
    key: PRODUCT_MEMBERS_ONLY_KEY,
    name: "Members only",
    type: "boolean",
    description:
      "When true, only customers tagged Approved Member can use the purchase experience.",
  },
];

async function getMetaobjectDefinitionByType(admin: AdminClient) {
  const response = await admin.graphql(
    `#graphql
      query ApplicationMetaobjectDefinition($type: String!) {
        metaobjectDefinitionByType(type: $type) {
          id
          name
          type
        }
      }`,
    { variables: { type: METAOBJECT_TYPE } },
  );
  const json = await response.json();
  return json.data?.metaobjectDefinitionByType as
    | { id: string; name: string; type: string }
    | null
    | undefined;
}

export async function ensureApplicationMetaobjectDefinition(
  admin: AdminClient,
): Promise<DefinitionResult> {
  const existing = await getMetaobjectDefinitionByType(admin);
  if (existing?.id) {
    await syncMissingApplicationFields(admin, existing.id);
    return {
      ok: true,
      created: false,
      skipped: true,
      id: existing.id,
      errors: [],
    };
  }

  const definition = buildApplicationMetaobjectDefinition();
  const response = await admin.graphql(
    `#graphql
      mutation CreateApplicationMetaobject($definition: MetaobjectDefinitionCreateInput!) {
        metaobjectDefinitionCreate(definition: $definition) {
          metaobjectDefinition {
            id
            type
            name
          }
          userErrors {
            field
            message
            code
          }
        }
      }`,
    { variables: { definition } },
  );

  const json = await response.json();
  const payload = json.data?.metaobjectDefinitionCreate;
  const userErrors = payload?.userErrors ?? [];
  const errors = userErrors.map(
    (e: { message: string }) => e.message,
  ) as string[];

  if (errors.length) {
    const again = await getMetaobjectDefinitionByType(admin);
    if (again?.id) {
      await syncMissingApplicationFields(admin, again.id);
      return {
        ok: true,
        created: false,
        skipped: true,
        id: again.id,
        errors: [],
      };
    }
    console.error("[xm-definitions] metaobjectDefinitionCreate failed", {
      errors,
      graphQLErrors: json.errors,
      type: METAOBJECT_TYPE,
    });
    return { ok: false, created: false, skipped: false, errors };
  }

  if (json.errors?.length) {
    const messages = json.errors.map((e: { message: string }) => e.message);
    console.error("[xm-definitions] metaobjectDefinitionCreate graphql errors", messages);
    return { ok: false, created: false, skipped: false, errors: messages };
  }

  return {
    ok: true,
    created: true,
    skipped: false,
    id: payload?.metaobjectDefinition?.id,
    errors: [],
  };
}

async function syncMissingApplicationFields(
  admin: AdminClient,
  definitionId: string,
) {
  const response = await admin.graphql(
    `#graphql
      query ApplicationDefinitionFields($id: ID!) {
        metaobjectDefinition(id: $id) {
          id
          fieldDefinitions { key }
        }
      }`,
    { variables: { id: definitionId } },
  );
  const json: {
    data?: {
      metaobjectDefinition?: {
        fieldDefinitions?: Array<{ key: string }>;
      } | null;
    };
  } = await response.json();

  const existingKeys = new Set(
    (json.data?.metaobjectDefinition?.fieldDefinitions ?? []).map((f) => f.key),
  );

  const desired = buildApplicationMetaobjectDefinition().fieldDefinitions as Array<{
    key: string;
    name: string;
    type: string;
    required?: boolean;
    description?: string;
  }>;

  const missing = desired.filter((f) => !existingKeys.has(f.key));
  if (!missing.length) return;

  await admin.graphql(
    `#graphql
      mutation SyncApplicationDefinitionFields($id: ID!, $definition: MetaobjectDefinitionUpdateInput!) {
        metaobjectDefinitionUpdate(id: $id, definition: $definition) {
          metaobjectDefinition { id }
          userErrors { message }
        }
      }`,
    {
      variables: {
        id: definitionId,
        definition: {
          fieldDefinitions: missing.map((field) => ({
            create: {
              key: field.key,
              name: field.name,
              type: field.type,
              required: Boolean(field.required),
              description: field.description,
            },
          })),
        },
      },
    },
  );
}

async function listCustomerMetafieldKeys(admin: AdminClient) {
  const response = await admin.graphql(
    `#graphql
      query CustomerPrivateReserveMetafields($namespace: String!) {
        metafieldDefinitions(
          first: 50
          ownerType: CUSTOMER
          namespace: $namespace
        ) {
          nodes {
            id
            key
            namespace
          }
        }
      }`,
    { variables: { namespace: CUSTOMER_METAFIELD_NAMESPACE } },
  );
  const json = await response.json();
  const nodes = (json.data?.metafieldDefinitions?.nodes ?? []) as Array<{
    id: string;
    key: string;
    namespace: string;
  }>;
  return new Set(nodes.map((n) => n.key));
}

export async function ensureCustomerMetafieldDefinitions(
  admin: AdminClient,
): Promise<{
  ok: boolean;
  createdKeys: string[];
  skippedKeys: string[];
  errors: string[];
}> {
  const existing = await listCustomerMetafieldKeys(admin);
  const createdKeys: string[] = [];
  const skippedKeys: string[] = [];
  const errors: string[] = [];

  for (const def of CUSTOMER_METAFIELD_DEFINITIONS) {
    if (existing.has(def.key)) {
      skippedKeys.push(def.key);
      continue;
    }

    try {
      const response = await admin.graphql(
        `#graphql
        mutation CreateCustomerMetafield($definition: MetafieldDefinitionInput!) {
          metafieldDefinitionCreate(definition: $definition) {
            createdDefinition {
              id
              key
              namespace
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
            definition: {
              name: def.name,
              namespace: CUSTOMER_METAFIELD_NAMESPACE,
              key: def.key,
              description: def.description,
              type: def.type,
              ownerType: "CUSTOMER",
              // Merchant-owned custom namespace: omit access.admin
              access: {
                storefront: "PUBLIC_READ",
              },
            },
          },
        },
      );

      const json = await response.json();
      const payload = json.data?.metafieldDefinitionCreate;
      const userErrors = (payload?.userErrors ?? []) as Array<{
        message: string;
      }>;

      if (userErrors.length) {
        const messages = userErrors.map((e) => `${def.key}: ${e.message}`);
        if (messages.some((m) => /taken|already|exists|duplicate/i.test(m))) {
          skippedKeys.push(def.key);
        } else {
          errors.push(...messages);
        }
        continue;
      }

      createdKeys.push(def.key);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${def.key}: ${message}`);
    }
  }

  return {
    ok: errors.length === 0,
    createdKeys,
    skippedKeys,
    errors,
  };
}

async function listProductMetafieldKeys(admin: AdminClient) {
  const response = await admin.graphql(
    `#graphql
      query ProductPrivateReserveMetafields($namespace: String!) {
        metafieldDefinitions(
          first: 50
          ownerType: PRODUCT
          namespace: $namespace
        ) {
          nodes {
            id
            key
            namespace
          }
        }
      }`,
    { variables: { namespace: PRODUCT_METAFIELD_NAMESPACE } },
  );
  const json = await response.json();
  const nodes = (json.data?.metafieldDefinitions?.nodes ?? []) as Array<{
    id: string;
    key: string;
    namespace: string;
  }>;
  return new Set(nodes.map((n) => n.key));
}

export async function ensureProductMetafieldDefinitions(
  admin: AdminClient,
): Promise<{
  ok: boolean;
  createdKeys: string[];
  skippedKeys: string[];
  errors: string[];
}> {
  const existing = await listProductMetafieldKeys(admin);
  const createdKeys: string[] = [];
  const skippedKeys: string[] = [];
  const errors: string[] = [];

  for (const def of PRODUCT_METAFIELD_DEFINITIONS) {
    if (existing.has(def.key)) {
      skippedKeys.push(def.key);
      continue;
    }

    try {
      const response = await admin.graphql(
        `#graphql
        mutation CreateProductMetafield($definition: MetafieldDefinitionInput!) {
          metafieldDefinitionCreate(definition: $definition) {
            createdDefinition {
              id
              key
              namespace
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
            definition: {
              name: def.name,
              namespace: PRODUCT_METAFIELD_NAMESPACE,
              key: def.key,
              description: def.description,
              type: def.type,
              ownerType: "PRODUCT",
              access: {
                storefront: "PUBLIC_READ",
              },
            },
          },
        },
      );

      const json = await response.json();
      const payload = json.data?.metafieldDefinitionCreate;
      const userErrors = (payload?.userErrors ?? []) as Array<{
        message: string;
      }>;

      if (userErrors.length) {
        const messages = userErrors.map((e) => `${def.key}: ${e.message}`);
        if (messages.some((m) => /taken|already|exists|duplicate/i.test(m))) {
          skippedKeys.push(def.key);
        } else {
          errors.push(...messages);
        }
        continue;
      }

      createdKeys.push(def.key);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${def.key}: ${message}`);
    }
  }

  return {
    ok: errors.length === 0,
    createdKeys,
    skippedKeys,
    errors,
  };
}

export async function ensureShopifyDefinitions(admin: AdminClient) {
  const metaobject = await ensureApplicationMetaobjectDefinition(admin);
  const metafields = await ensureCustomerMetafieldDefinitions(admin);
  const products = await ensureProductMetafieldDefinitions(admin);

  return {
    ok: metaobject.ok && metafields.ok && products.ok,
    metaobject,
    metafields,
    products,
  };
}

export async function getDefinitionsStatus(admin: AdminClient) {
  const metaobject = await getMetaobjectDefinitionByType(admin);
  const metafieldKeys = await listCustomerMetafieldKeys(admin);
  let productKeys = new Set<string>();
  try {
    productKeys = await listProductMetafieldKeys(admin);
  } catch {
    productKeys = new Set();
  }

  return {
    metaobject: metaobject
      ? { exists: true, id: metaobject.id, name: metaobject.name, type: metaobject.type }
      : { exists: false },
    customerMetafields: {
      namespace: CUSTOMER_METAFIELD_NAMESPACE,
      keys: CUSTOMER_METAFIELD_DEFINITIONS.map((d) => d.key),
      present: CUSTOMER_METAFIELD_DEFINITIONS.map((d) => d.key).filter((k) =>
        metafieldKeys.has(k),
      ),
      missing: CUSTOMER_METAFIELD_DEFINITIONS.map((d) => d.key).filter(
        (k) => !metafieldKeys.has(k),
      ),
    },
    productMetafields: {
      namespace: PRODUCT_METAFIELD_NAMESPACE,
      keys: PRODUCT_METAFIELD_DEFINITIONS.map((d) => d.key),
      present: PRODUCT_METAFIELD_DEFINITIONS.map((d) => d.key).filter((k) =>
        productKeys.has(k),
      ),
      missing: PRODUCT_METAFIELD_DEFINITIONS.map((d) => d.key).filter(
        (k) => !productKeys.has(k),
      ),
    },
  };
}
