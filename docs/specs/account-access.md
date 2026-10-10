# Account access and loyalty ownership

> **Authority:** customer account lifecycle, claim and merge business behavior and observable account UI.
> **Read when:** changing Google onboarding, legacy account claims, account phone ownership or account UI.
> **Update when:** an account transition, proof requirement, loyalty ownership or visible failure changes.
> **Does not own:** HTTP fields, physical schema, reward calculation or shared overlay primitives.

Contracts belong to [API](../../API.md#google-account-access); persistence to
[SCHEMA](../../SCHEMA.md#users); rationale to [ADR 0007](../decisions/0007-google-account-access.md).
Reward amounts and entitlement outcomes stay with the existing welcome reward owner.

## Account lifecycle

New customer onboarding uses Google Identity Services for Gmail or a verified Google Workspace
identity. There is no application email OTP. Existing phone/Instagram password accounts retain
login and may link Google. Staff/Admin password access remains separate from customer onboarding.
New loyalty ghosts are created by email; they have no login credential and receive no welcome gift.
Matching verified Google email activates that same identity. Gmail dots are canonicalized; Workspace
dots remain significant. Email ghost creation rejects plus-addresses.

A legacy phone ghost may be claimed only if it is an unblocked, unmerged CUSTOMER with no real
password or Google subject and either a positive points log in its history or any voucher.
A zero current points balance does not remove historical eligibility.

## Admin claim and customer acceptance

Admin sees `Gửi link xác thực` only when the server reports eligibility. The existing customer
overlay switches to claim content. It shows QR encoding the exact link, a copy control and remaining
server-derived lifetime. Footer actions `Tạo lại link` and `Mở Zalo` share one row. Zalo opens the
customer phone; sending is manual. Regeneration replaces the old link immediately. Expired or failed
generation has a visible retry state; no stale QR is presented as usable.

The link lasts five minutes and contains a random opaque token, no phone, name or user identifier.
The claim page exchanges its fragment for a protected cookie, then removes the fragment. Reload
may resume the same claim until its original expiry. Opening the page alone does not consume proof.
Before successful acceptance, the page reveals no ghost name, phone, balance or voucher details.
In Zalo, the first successful fragment exchange may offer a copy action using the original link
kept only in page memory, for pasting into Chrome/Safari. A cookie-only reload has no shareable
proof: do not copy the cleaned URL or direct users to open that URL externally. Ask them to reopen
the original link from the shop message in their external browser, or request a new link after expiry.
Expired contexts expose no handoff control; copy failures direct users back to the original message.

Google is primary, with the exact caption:
“Đăng nhập bằng gmail để dễ dàng nhận nhiều thông báo khuyến mãi”.
A legacy customer may instead enter password and confirmation. Successful Google acceptance does
not force password entry; eligible legacy accounts may set it later in Profile after fresh Google
reauthentication. A Google/email-origin account cannot gain phone/password login merely by adding
a self-declared phone. Claim completion is atomic and single-use.
Profile shows change-password controls only when `has_password` is true. Eligible legacy accounts
without a password use the existing `can_set_password` flow and fresh Google proof instead.

## Existing Google account and merge

When valid proof identifies an eligible legacy ghost, the legacy ghost remains the canonical
customer. Move the existing Google account's credentials, points, vouchers and customer history to
it transactionally. Preserve financial snapshots and every existing voucher; never issue a second
welcome entitlement because of a merge. Prefer the Google source's name and Instagram. The target
ghost's phone replaces the source phone. Retain a source tombstone and merge audit, clear source
unique contacts/credentials and revoke old sessions. Old customer QR aliases resolve to the
canonical customer; they do not turn an identity lookup into proof of a voucher scan.

If both accounts have welcome entitlements, keep the target entitlement canonical and retain the
source entitlement and its outcome together as immutable audit history on the retired source.
A pending source entitlement cannot be opened after merge. Already-issued vouchers and credited
points still move to the canonical customer; no second welcome entitlement is issued. If only the
source has an entitlement, move that entitlement and its outcome together. The merge audit records
both entitlement IDs and the retention or transfer action.

When both accounts have a voucher grant for the same package, retain the target grant as the
canonical idempotency marker and the source grant as historical audit on the tombstone. Record the
retained source grant IDs in merge audit. Move every actual voucher regardless of grant collision.
New requests must reject retired identities. Financial writes coordinate with merge transactions
so requests authenticated just before a merge cannot write a new balance or entitlement to its source.

## Phone in Profile

An unused normalized phone may be saved without OTP, subject to uniqueness. A phone held by a full
account or an ineligible ghost is rejected. Only collision with an eligible legacy ghost requires
OTP proof bound to actor, session, target and phone. A successful proof merges into the ghost
identity and returns its points/vouchers. Disabled OTP, unavailable provider, unknown delivery or
failed admission must not attach the phone or merge accounts. Show the shop Facebook contact action
using the same URL source as Footer. Changing phone resets challenge state; resend follows server
time. Never persist passwords or OTP in browser storage.

Delivery recipient phone belongs to address/order data and does not update account identity.
Google login is not marketing consent; any future promotional email subscription is separate.

## Search and acceptance

Search matches name, phone, email and Instagram. Customer cards display name and only present
contact fields. POS customer selection and actual voucher QR verification remain distinct.

Manual UI acceptance is required for mobile sheet sizing, two footer actions on one row, keyboard/
screen-reader feedback, popup blocked/cancelled recovery, embedded Zalo/Facebook browsers, expired
links, regeneration, copying, reload, OTP countdown with a skewed device clock, old customer QR
after merge, provider failures and Google login returning to the prior
customer intent. Mock tests cannot establish provider delivery, real popup behavior or migration replay.
