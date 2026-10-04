# Private order signals

Status: Accepted
Date: 2026-10-04

## Context

The authorized task adds Supabase Realtime to the existing admin/staff order lists in separate
staging and production projects. The app has custom cookie authentication and keeps application
tables inaccessible to anonymous and authenticated Data API clients.

## Decision

Use private Broadcast with server-issued, short-lived operator capabilities. Committed app writes
publish a minimal REST signal; browsers refetch through existing authorized APIs.

## Alternatives

Direct Postgres Changes would require opening order-row visibility to the Supabase client role and
adapting custom sessions to row authorization. Database-trigger Broadcast can cover every writer,
but adds database trigger ownership and coupling that this task does not need.

## Consequences

The API retains authorization and joined DTO ownership. Serverless handlers need no persistent
socket and clients receive no business row payloads. REST delivery can fail after commit; periodic
safety refresh and reconnect catch-up bound stale lists without an outbox. Reconsider a durable
publisher if delivery guarantees become a business requirement or external writers are introduced.

Current owners: [Runtime architecture](../../SPECIFICATION.md#order-realtime),
[token contract](../../API.md#get-apirealtimeorderstoken),
[Realtime skill](../../.agents/skills/supabase-realtime/SKILL.md).

