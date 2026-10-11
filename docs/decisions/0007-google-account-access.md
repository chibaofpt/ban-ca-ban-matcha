# Google customer access and transitional legacy claims

Status: Accepted
Date: 2026-10-09

## Context

Existing production loyalty history includes phone ghosts. The accepted product direction uses
Google for new customers while preserving earned points, vouchers and legacy password access.
Only the transitional collision with an eligible phone ghost warrants paid OTP.

## Decision

Keep custom jose/httpOnly application sessions and integrate Google Identity Services ID-token
verification. Reuse Cloudflare Turnstile and existing paid-send admission instead of introducing
a second authentication/session platform. Use short-lived opaque claim links sent manually by
Admin. Preserve the legacy ghost as canonical when the owner proves its claim; retain audited
source aliases rather than deleting history. New loyalty ghosts use email.

This supersedes ADR 0004's public phone-registration policy. Its ABENLA adapter, quota reservation
and unknown-delivery handling remain relevant to the transitional phone-ghost proof only.

## Alternatives

- Migrating sessions to Supabase Auth/NextAuth adds platform migration beyond the accepted scope.
- Email OTP duplicates Google's identity proof and was explicitly excluded.
- Automatically accepting a duplicate phone without proof would let another customer take loyalty.
- Hashing a phone into a public link still exposes a small searchable input space; random tokens
  avoid that dependency and support expiry/revocation.
- Deleting merged users loses QR compatibility and audit traceability.

## Consequences

Google credentials and opaque proofs need verified audience/nonce, transactional consumption and
a clear browser failure path. Marketing email remains a separate integration and consent flow.
Retire transitional SMS only after eligible legacy ghosts are resolved, in a later approved task.
Deployment requires historical migration reconciliation and staging acceptance; local artifact and
mock checks do not establish either.

## Current owners

- [Account lifecycle and UI](../specs/account-access.md)
- [API account access](../../API.md#google-account-access)
- [User/schema semantics](../../SCHEMA.md#users)
- [Runtime architecture](../../SPECIFICATION.md#runtime-architecture)
