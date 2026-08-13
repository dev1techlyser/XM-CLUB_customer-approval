# XM Private Reserve — Phase 5 QA checklist

Manual testing (no external DB). Re-auth after adding `read_products,write_products`. Run **Settings → Ensure definitions**.

## End-to-end happy path

- [ ] Visitor opens Apply For Consideration
- [ ] Submits form → success + application number XM-######
- [ ] Metaobject created PENDING
- [ ] Admin Dashboard Pending increments
- [ ] Admin opens application
- [ ] Admin Approves
- [ ] Customer found or created
- [ ] Tags: `Approved Member` (+ legacy `member`)
- [ ] Metafields: membership_type, member_number, referral_code, application link, dates
- [ ] Application APPROVED + shopify_customer_id
- [ ] Approval notification / account invite (no password asked)
- [ ] Customer activates / logs in
- [ ] `/pages/private-reserve-members` dashboard visible
- [ ] Member-only product with `private_reserve.members_only = true` shows Add to Cart
- [ ] Members admin lists the member; detail shows application + referral ID

## Access matrix

| Actor | Member area | Members-only product purchase |
|---|---|---|
| Logged out | Gate + Request Membership | Available by Invitation + Request Membership |
| Normal customer | Gate | Invitation gate |
| Pending applicant | Gate | Invitation gate |
| Rejected | Gate | Invitation gate |
| Waitlisted | Gate | Invitation gate |
| Approved Member | Dashboard | Purchase form |
| Tag removed | Gate | Invitation gate |

## Edge cases

- [ ] Existing customer email → approve links existing customer (no duplicate)
- [ ] New customer → create + invite
- [ ] Duplicate application (active) → 409
- [ ] Duplicate approve click → idempotent, no duplicate email
- [ ] Resend Approval Email → sends again
- [ ] Reject / Waitlist → no member tag
- [ ] Invalid membership type → approve blocked with message
- [ ] Referral name matching Approved Member → referring_customer_id set
- [ ] Rate limit: >5 posts / 15 min → 429
- [ ] Direct URL to member page / product while logged out
- [ ] Mobile + desktop layouts

## Product metafield setup

1. Product → Metafields → Private Reserve → **Members only** = true  
2. Use XM product template (e.g. cigar-roller) with XM purchase section  
3. Confirm non-members never see the product form HTML for Add to Cart
