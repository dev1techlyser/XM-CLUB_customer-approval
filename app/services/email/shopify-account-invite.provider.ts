import type {
  ApprovalEmailAdmin,
  ApprovalEmailPayload,
  ApprovalEmailProvider,
  ApprovalEmailResult,
} from "./types";
import { composeApprovalEmailCopy } from "./types";

/**
 * Default provider: Shopify customer account invite (no passwords).
 * CTA aligns with "Activate Your Membership" via Shopify account activation.
 * Branded HTML from composeApprovalEmailCopy is retained for future providers.
 */
export const shopifyAccountInviteProvider: ApprovalEmailProvider = {
  name: "shopify_account_invite",

  async sendApprovalEmail(
    payload: ApprovalEmailPayload,
    context: { admin: ApprovalEmailAdmin },
  ): Promise<ApprovalEmailResult> {
    // Keep composed copy available for logging / future SMTP/Resend providers
    void composeApprovalEmailCopy(payload);

    const response = await context.admin.graphql(
      `#graphql
        mutation InvitePrivateReserveMember($customerId: ID!) {
          customerSendAccountInviteEmail(customerId: $customerId) {
            customer { id }
            userErrors { message }
          }
        }`,
      { variables: { customerId: payload.customerId } },
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
    const errMsg =
      userErrors[0]?.message || json.errors?.[0]?.message || undefined;

    if (errMsg) {
      // Common when the customer already activated an account
      if (/already|enabled|invite/i.test(errMsg)) {
        return {
          ok: true,
          provider: "shopify_account_invite",
          sent: false,
          skipped: true,
          message:
            "Customer already has account access. They can sign in at /account/login.",
        };
      }
      return {
        ok: false,
        provider: "shopify_account_invite",
        sent: false,
        message: errMsg,
      };
    }

    return {
      ok: true,
      provider: "shopify_account_invite",
      sent: true,
      message:
        "Shopify account activation invite sent (Activate Your Membership).",
    };
  },
};
