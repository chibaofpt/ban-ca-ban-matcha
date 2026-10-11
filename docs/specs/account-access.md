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
password or Google subject and a positive current points balance, a positive points log in its
history, or any voucher. A positive legacy balance remains eligible even when its original
points logs are unavailable.
A zero current points balance does not remove historical eligibility.

## Login modal

Opening the modal automatically prepares and loads the official Google sign-in button. There is
no intermediate application button to reveal it. Google loading has an inline status/retry state
and never waits for Turnstile before the user can select a Google account. Turnstile runs in
parallel with `interaction-only` appearance; it is visible only when Cloudflare requires interaction.
After Google selection, complete authentication only when both proofs pass under the
[API contract](../../API.md#google-account-access). Pending verification continues automatically
without another login click. CAPTCHA failure offers an explicit retry and retains the Google
assertion while its preparation remains valid; expired or invalid Google proof needs a fresh start.
Keep all credentials in component memory and prevent duplicate or overlapping login submissions.

Below Google, show `Hoặc`, one visibly labeled `Số điện thoại hoặc Instagram` input and `Tiếp tục`.
Email is not accepted here; email access uses Google. Next/Enter validates format locally and moves
directly to the password step, without an account-existence request or disclosure. Keep existing
phone/Instagram normalization. The password step displays the submitted identifier, a password
input with visibility toggle, `Đăng nhập` and `Quay lại` to edit the identifier. Focus moves to the
password on Next and returns to the identifier on Back; Back clears the password. Failed login
keeps the form and existing server error behavior. Password access does not gain a CAPTCHA gate.
The alternate method stays usable while Google's SDK or background verification is loading;
disable overlapping submission only while an authentication request is pending.

CLAIM shares the immediate Google/background Turnstile flow below; LINK/REAUTH keep their existing
preparation flow. Successful login preserves customer
intent, cart identity, staff routing and welcome-reward handling. Manual acceptance covers first
open, Enter/Back/focus, password autofill, Google cancel/retry, delayed/failed Turnstile and the
interactive challenge on mobile and desktop; mock tests do not prove live widget behavior.

## Admin claim and customer acceptance

Admin sees `Gửi link xác thực` only when the server reports eligibility. The existing customer
overlay switches to claim content and immediately creates the link once, without a second click.
It shows QR encoding the exact link, a copy icon beside the read-only URL and remaining
server-derived lifetime. Footer actions `Tạo lại link` and the sky-blue `Mở Zalo` share one row and
are locked during generation/copy. Zalo requires a valid link and customer phone, copies the exact
link before opening that customer's Zalo, and keeps sending manual. Clipboard/popup failure has
explicit feedback. Regeneration replaces the old link immediately. Expired or failed
generation has a visible retry state; no stale QR is presented as usable.
The [Admin claim presentation contract](admin-customer-management.md#account-actions) requires
the QR/link/actions to fit one viewport without scrolling, with flexible QR sizing and a
landscape layout that preserves visible controls.

The link lasts five minutes and contains a random opaque token, no phone, name or user identifier.
The claim page exchanges its fragment for a protected cookie, then removes the fragment. Reload
may resume the same claim until its original expiry. Opening the page alone does not consume proof.
After valid unexpired context resolution, show the account phone in local format so the customer
can recognize it. Invalid/expired contexts reveal no account data. Before successful acceptance,
keep the ghost name, balance and voucher details private.
In Zalo, the first successful fragment exchange may offer a copy action using the original link
kept only in page memory, for pasting into Chrome/Safari. A cookie-only reload has no shareable
proof: do not copy the cleaned URL or direct users to open that URL externally. Ask them to reopen
the original link from the shop message in their external browser, or request a new link after expiry.
Expired contexts expose no handoff control; copy failures direct users back to the original message.

Google is the only acceptance method, with the caption:
“Liên kết Google để nhận tài khoản và đăng nhập ngay.”
Load the official widget as soon as context is resolved, without another application button or
waiting for CAPTCHA. Turnstile runs independently with `interaction-only` appearance, with the
same automatic completion/retry behavior as the login modal. There is no password form; the
[retired password endpoint](../../API.md#google-account-access) cannot accept old clients' claims.
Successful acceptance creates the session immediately; there is no extra login step.
Eligible legacy accounts may set a password later in Profile after fresh Google
reauthentication. A Google/email-origin account cannot gain phone/password login merely by adding
a self-declared phone. Claim completion is atomic and single-use.
The first successful claim creates its welcome entitlement using the current admin configuration
and existing [reward owner](../../.agents/skills/voucher-flow/references/lifecycle.md#welcome-reward-and-gacha).
Reuse the canonical entitlement after a merge; create it only if neither identity already has one.
Return the effective reward summary and follow [Reward UI](reward-ui.md#entry-defer-và-resume):
announce completed points/voucher, or open pending GACHA immediately. Defer/continue goes to Profile
with the session active. Do not display an expired-link error after acceptance while opening a gift.
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
Claim acceptance additionally covers recognizable phone, Google before CAPTCHA, interactive
challenge/retry, Google-only Zalo handoff and all three configured reward modes after auto-login.
