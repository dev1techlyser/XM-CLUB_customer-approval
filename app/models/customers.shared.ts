/**
 * Client-safe customer helpers (no Admin API / Prisma).
 * Keep these out of `*.server.ts` so Remix route UI can import them.
 */

export type MemberListSort =
  | "joined_desc"
  | "joined_asc"
  | "name_asc"
  | "name_desc"
  | "member_number_asc"
  | "member_number_desc";

export function customerAdminUrl(shop: string, customerGid: string): string {
  const numeric = customerGid.split("/").pop() || "";
  const storeHandle = shop.replace(/\.myshopify\.com$/i, "");
  return `https://admin.shopify.com/store/${storeHandle}/customers/${numeric}`;
}

const PCD_HELP =
  "This app is not approved for Protected Customer Data yet. In Partner Dashboard → your app → API access → Protected customer data access, request Protected customer data and the Name + Email fields, then Save. For development stores you do not need Shopify review after saving. Then retry Approve.";

export function isProtectedCustomerDataError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const nested =
    error &&
    typeof error === "object" &&
    "response" in error &&
    error.response &&
    typeof error.response === "object" &&
    "errors" in (error.response as object)
      ? JSON.stringify((error.response as { errors?: unknown }).errors)
      : "";
  const blob = `${message} ${nested}`;
  return /protected customer data|not approved to access the Customer object/i.test(
    blob,
  );
}

export function protectedCustomerDataMessage(error?: unknown): string {
  if (error && !isProtectedCustomerDataError(error) && error instanceof Error) {
    return error.message;
  }
  return PCD_HELP;
}
