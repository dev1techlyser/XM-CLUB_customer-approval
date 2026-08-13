import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

import { shopifyAccountInviteProvider } from "./shopify-account-invite.provider";
import type {
  ApprovalEmailPayload,
  ApprovalEmailProvider,
  ApprovalEmailResult,
} from "./types";

/**
 * Resolve email provider. Default: Shopify account invite.
 * Later: EMAIL_PROVIDER=resend|smtp without changing approve flow.
 */
export function getApprovalEmailProvider(): ApprovalEmailProvider {
  const key = (process.env.EMAIL_PROVIDER || "shopify").toLowerCase();
  switch (key) {
    case "shopify":
    case "shopify_account_invite":
    default:
      return shopifyAccountInviteProvider;
  }
}

export async function sendModularApprovalEmail(params: {
  admin: AdminApiContext;
  payload: ApprovalEmailPayload;
}): Promise<ApprovalEmailResult> {
  const provider = getApprovalEmailProvider();
  return provider.sendApprovalEmail(params.payload, { admin: params.admin });
}

export { composeApprovalEmailCopy } from "./types";
