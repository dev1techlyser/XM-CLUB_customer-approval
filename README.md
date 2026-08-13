# XM Private Reserve

Embedded Shopify admin app for the **XM Private Reserve Society** membership workflow.

## Architecture (Option C)

| Concern | Storage |
|---|---|
| Membership applications | Shopify **Metaobject** `private_reserve_application` |
| Approved members | Shopify **Customers** |
| Membership data on members | Customer metafields `private_reserve.*` |
| OAuth sessions | Local SQLite `Session` table only (Shopify template requirement) |

**No PostgreSQL / MySQL / MongoDB application database.**

Theme is not modified in Phase 1.

## Phase 1

- Embedded app auth (Shopify managed / App Bridge)
- Admin API access (server-side only)
- Create Metaobject definition + Customer metafield definitions
- Nav: Dashboard · Applications · Members · Settings
- Dashboard counts from Metaobject `status` field (not hardcoded)

## Setup

```bash
cd E:\CURSOR-SHOPIFY\xm-private-reserve
npm install
npx prisma migrate deploy   # Session table only
cp .env.example .env
npm run config:link         # interactive — Partners org + app
npm run dev
```

Install on store `xmclub-psw9jzce`, open **Apps → XM Private Reserve**.

On first load, the app ensures Metaobject + metafield definitions exist (also available under **Settings**).

## Scopes

```
read_metaobjects,write_metaobjects,read_metaobject_definitions,write_metaobject_definitions,read_customers,write_customers
```

## Phase 2 — storefront → Metaobject

Theme form (`xm-application`) posts via App Proxy:

`POST /apps/xm-private-reserve/applications`

Creates `private_reserve_application` with `status=PENDING`, then best-effort Shopify contact inbox submit.

### Test on a store where the app is installed

1. Keep `shopify app dev` running (app proxy URL updates automatically)
2. Push theme changes to that same store (or use theme preview)
3. Submit Apply For Consideration form
4. Confirm success shows Application Number `XM-######`
5. Confirm Dashboard count Pending increments
6. Open Applications → detail
7. Confirm Admin → Inbox contact message (best-effort)

**Note:** App must be installed on the store that hosts the theme. Client transfer store `xmclub` needs the app installed before live form→Metaobject works there.

## Phase 3 — Approve / Reject / Waitlist

Application detail actions:

- **Mark Under Review** → Metaobject `UNDER_REVIEW`
- **Approve** → find/create Customer, tag `Approved Member`, set `private_reserve.*` metafields, unique member number `XM-#####`, Metaobject `APPROVED`, account invite email
- **Reject** → `REJECTED` + `rejected_at` (no customer create)
- **Waitlist** → `WAITLISTED` + `waitlisted_at` (no member)

Idempotent approve: second click does not duplicate customer/member number.

Audit: status timestamps + append-only lines in Metaobject `admin_notes` (Shopify-native; no external event DB).

## Phase 4 — Approval notification + Member area

### Approval email (modular)
- `app/services/email/` — provider interface; default `EMAIL_PROVIDER=shopify` uses `customerSendAccountInviteEmail` (no passwords)
- Metaobject field `approval_email_sent_at` prevents duplicate sends on re-approve
- Admin **Resend Approval Email** is the only explicit re-send path

### Member area (theme)
- Template: `page.private-reserve-members`
- Create Online Store page handle `private-reserve-members` using that template
- Liquid gate: `customer.tags contains 'Approved Member'`
- Member nav + dashboard (type, number, status, since, events, releases, announcements, referral)
- Header/drawer link for approved members only
- Approve also adds legacy tag `member` for older product gates; product defaults now use `Approved Member`

## Phase 5 — Member products, referrals, Members admin, hardening

See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for diagram, limitations, security, and deployment.

### Member-only products
- Product metafield `private_reserve.members_only` (boolean), storefront PUBLIC_READ
- Theme Liquid gates XM purchase/hero when metafield is true (fallback: section member_tag)
- Non-members: **Available by Invitation** + **Request Membership**
- Scopes added: `read_products`, `write_products`

### Referral
- Existing form fields stored on Metaobject (unchanged)
- On approve: `referral_code` = member number on customer; best-effort `referring_customer_id` / `referring_member_number`
- Future custom codes: update `referral_code` only — no form change required

### Members admin
- `/app/members` — search, filter by type, sort, pagination
- `/app/members/:id` — detail with application + referral association

### Hardening
- App Proxy in-process rate limit (5 / 15 min)
- Stronger member-number uniqueness check
- Webhook debug logs removed
- Settings shows product metafield sync status

## Suggested final commit message

```
feat: complete XM Private Reserve membership system (Phase 5)

Add members-only product metafield gating, referral association,
Members admin list/detail, security and performance hardening,
and architecture documentation without an external application database.
```
