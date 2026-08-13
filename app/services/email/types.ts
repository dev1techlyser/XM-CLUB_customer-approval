/**
 * Modular approval notification layer.
 * Swap providers via EMAIL_PROVIDER without changing approve/resend call sites.
 * Never handles passwords — uses Shopify customer account activation when provider=shopify.
 */

export type ApprovalEmailPayload = {
  to: string;
  customerId: string;
  fullName: string;
  membershipType: string;
  memberNumber: string;
  shopDomain: string;
  /** Intended CTA label for branded providers */
  ctaLabel: string;
};

export type ApprovalEmailResult = {
  ok: boolean;
  provider: string;
  /** True when a new outbound notification was actually sent */
  sent: boolean;
  /** Soft skip (already has account / provider no-op) still counts as notified */
  skipped?: boolean;
  message?: string;
};

export interface ApprovalEmailProvider {
  readonly name: string;
  sendApprovalEmail(
    payload: ApprovalEmailPayload,
    context: { admin: ApprovalEmailAdmin },
  ): Promise<ApprovalEmailResult>;
}

/** Minimal admin GraphQL surface used by providers */
export type ApprovalEmailAdmin = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

export function composeApprovalEmailCopy(payload: ApprovalEmailPayload): {
  subject: string;
  previewText: string;
  bodyText: string;
  html: string;
} {
  const subject = "XM Private Reserve Society — Membership Approved";
  const previewText = "Your membership application has been approved.";
  const bodyText = [
    "XM Private Reserve Society",
    "",
    "Your membership application has been approved.",
    "",
    `Membership Type: ${payload.membershipType}`,
    `Member Number: ${payload.memberNumber}`,
    "",
    `${payload.ctaLabel}`,
    "",
    "Use Shopify customer account activation / sign-in to access your membership.",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0a0a0a;color:#f7f4ef;font-family:Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#111111;border:1px solid rgba(196,163,90,0.22);padding:40px 32px;">
        <tr><td style="font-size:12px;letter-spacing:0.28em;text-transform:uppercase;color:#c4a35a;">XM Private Reserve Society</td></tr>
        <tr><td style="padding-top:20px;font-size:28px;line-height:1.3;color:#f7f4ef;">Your membership application has been approved.</td></tr>
        <tr><td style="padding-top:24px;font-size:15px;line-height:1.7;color:rgba(247,244,239,0.72);">
          <strong style="color:#f7f4ef;">Membership Type:</strong> ${escapeHtml(payload.membershipType)}<br/>
          <strong style="color:#f7f4ef;">Member Number:</strong> ${escapeHtml(payload.memberNumber)}
        </td></tr>
        <tr><td style="padding-top:28px;">
          <a href="https://${escapeHtml(payload.shopDomain)}/account/login" style="display:inline-block;background:#c4a35a;color:#0a0a0a;text-decoration:none;padding:14px 22px;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;font-weight:600;">${escapeHtml(payload.ctaLabel)}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, previewText, bodyText, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
