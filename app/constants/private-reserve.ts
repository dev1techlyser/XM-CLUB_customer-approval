/** XM Private Reserve — shared domain constants (Option C: Metaobjects). */

export const APP_NAME = "XM Private Reserve";

export const METAOBJECT_TYPE = "private_reserve_application";
export const METAOBJECT_DISPLAY_NAME = "XM Private Reserve Society Application";

export const CUSTOMER_METAFIELD_NAMESPACE = "private_reserve";

/** Product metafield namespace — same namespace, product owner type */
export const PRODUCT_METAFIELD_NAMESPACE = "private_reserve";

/** When true, only Approved Members see the purchase experience */
export const PRODUCT_MEMBERS_ONLY_KEY = "members_only";

export const APPROVED_MEMBER_TAG = "Approved Member";

/** Legacy product-gate tag kept in sync for theme compatibility */
export const LEGACY_MEMBER_TAG = "member";

/** Stored on customer metafield private_reserve.membership_status */
export const CUSTOMER_MEMBERSHIP_STATUS_APPROVED = "Approved";

/** Member numbers: XM-00482 (5-digit). Applications use XM-000001 (6-digit). */
export function formatMemberNumber(value: number): string {
  return `XM-${String(value).padStart(5, "0")}`;
}

export const MEMBERSHIP_TYPES = [
  "Founding Member",
  "Reserve Member",
  "Collector Member",
] as const;

export type MembershipType = (typeof MEMBERSHIP_TYPES)[number];

export const APPLICATION_STATUSES = [
  "PENDING",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
  "WAITLISTED",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** Statuses the storefront is never allowed to set. */
export const STOREFRONT_FORBIDDEN_STATUSES = [
  "APPROVED",
  "REJECTED",
  "WAITLISTED",
  "UNDER_REVIEW",
] as const;

export const DEFAULT_APPLICATION_STATUS: ApplicationStatus = "PENDING";

export const EXPECTED_FORM_TYPE =
  "XM Private Reserve Society Application";

export const EXPECTED_REQUEST_TYPE =
  "Membership consideration — approve or reject in Admin";

export const ACTIVE_APPLICATION_STATUSES = [
  "PENDING",
  "UNDER_REVIEW",
  "WAITLISTED",
] as const;

export const YES_NO_VALUES = ["Yes", "No"] as const;

export const APP_PROXY_SUBPATH = "xm-private-reserve";

export const CUSTOMER_METAFIELD_KEYS = [
  "membership_status",
  "membership_type",
  "member_number",
  "application_number",
  "application_id",
  "approved_at",
  "joined_at",
  /**
   * Unique referral identifier for the approved member.
   * Currently = member number (XM-#####). Future custom codes can replace
   * this value without changing the storefront application form fields.
   */
  "referral_code",
] as const;

/** Application Metaobject fields that link to a referring Approved Member */
export const APPLICATION_REFERRER_FIELDS = [
  "referring_customer_id",
  "referring_member_number",
] as const;

export type CustomerMetafieldKey = (typeof CUSTOMER_METAFIELD_KEYS)[number];

export function isMembershipType(value: string): value is MembershipType {
  return (MEMBERSHIP_TYPES as readonly string[]).includes(value);
}

export function isApplicationStatus(value: string): value is ApplicationStatus {
  return (APPLICATION_STATUSES as readonly string[]).includes(value);
}

export function statusLabel(status: ApplicationStatus): string {
  switch (status) {
    case "PENDING":
      return "Pending";
    case "UNDER_REVIEW":
      return "Under Review";
    case "APPROVED":
      return "Approved";
    case "REJECTED":
      return "Rejected";
    case "WAITLISTED":
      return "Waitlisted";
    default:
      return status;
  }
}
