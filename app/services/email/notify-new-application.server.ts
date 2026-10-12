import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

import type { StorefrontApplicationInput } from "../../models/applications.server";

type AdminClient = AdminApiContext;

function shopAdminStorePath(shop: string): string {
  const handle = shop.replace(/\.myshopify\.com$/i, "").trim();
  return handle || shop;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function resolveNotifyRecipients(
  admin: AdminClient,
): Promise<string[]> {
  const fromEnv = (process.env.APPLICATION_NOTIFY_EMAIL || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (fromEnv.length) return fromEnv;

  try {
    const response = await admin.graphql(`#graphql
      query ShopContactForApplicationNotify {
        shop {
          contactEmail
          email
        }
      }`);
    const json: {
      data?: { shop?: { contactEmail?: string | null; email?: string | null } };
    } = await response.json();
    const shop = json.data?.shop;
    const candidate = (shop?.contactEmail || shop?.email || "").trim().toLowerCase();
    if (candidate) return [candidate];
  } catch (error) {
    console.error("[notify-new-application] shop contact lookup failed", error);
  }

  return [];
}

/**
 * Email store team when a new membership application is submitted (best-effort).
 * Requires RESEND_API_KEY on Vercel. Recipients: APPLICATION_NOTIFY_EMAIL and/or shop contact email.
 */
export async function notifyNewApplicationSubmitted(params: {
  admin: AdminClient;
  shop: string;
  applicationNumber: string;
  application: StorefrontApplicationInput;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn(
      "[notify-new-application] RESEND_API_KEY not set — admin notification skipped.",
    );
    return;
  }

  const to = await resolveNotifyRecipients(params.admin);
  if (!to.length) {
    console.warn(
      "[notify-new-application] No recipients (set APPLICATION_NOTIFY_EMAIL or shop contact email).",
    );
    return;
  }

  const from =
    process.env.APPLICATION_NOTIFY_FROM?.trim() ||
    "XM Club Applications <onboarding@resend.dev>";

  const app = params.application;
  const storePath = shopAdminStorePath(params.shop);
  const reviewUrl = `https://admin.shopify.com/store/${storePath}/apps`;

  const subject = `New membership application — ${params.applicationNumber}`;

  const lines: Array<[string, string | undefined]> = [
    ["Application #", params.applicationNumber],
    ["Name", app.full_name],
    ["Email", app.email],
    ["Membership type", app.membership_type],
    ["How they heard", app.how_did_hear],
    ["Membership interest", app.membership_interest],
    ["Favorite brands", app.favorite_cigar_brands],
    ["Attended XM event", app.attended_xm_event],
    ["Member referral", app.has_member_referral],
    ["Referring member", app.referring_member_name],
    ["Relationship", app.referral_relationship],
    ["Known how long", app.referral_relationship_duration],
    ["Social profile", app.social_profile],
    ["Notes", app.additional_notes],
    ["Source page", app.source_page],
  ];

  const textBody = [
    "A new XM Private Reserve Society application was submitted.",
    "",
    ...lines
      .filter(([, v]) => v && String(v).trim())
      .map(([label, value]) => `${label}: ${value}`),
    "",
    `Review in Shopify Admin → Apps → Customer Approval`,
    reviewUrl,
  ].join("\n");

  const rowsHtml = lines
    .filter(([, v]) => v && String(v).trim())
    .map(
      ([label, value]) =>
        `<tr><td style="padding:8px 12px 8px 0;color:#888;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:8px 0;color:#f7f4ef;">${escapeHtml(String(value))}</td></tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#0a0a0a;font-family:Helvetica,Arial,sans-serif;color:#f7f4ef;">
<p style="margin:0 0 16px;">New membership application <strong style="color:#c4a35a;">${escapeHtml(params.applicationNumber)}</strong></p>
<table role="presentation" cellpadding="0" cellspacing="0">${rowsHtml}</table>
<p style="margin:24px 0 0;"><a href="${escapeHtml(reviewUrl)}" style="color:#c4a35a;">Open Shopify Admin → Apps</a> and open <strong>Customer Approval</strong> to review.</p>
</body></html>`;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        text: textBody,
        html,
        reply_to: app.email,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error("[notify-new-application] Resend error", response.status, body);
    }
  } catch (error) {
    console.error("[notify-new-application] send failed", error);
  }
}
