---
name: supabase-realtime
description: Apply the project Realtime architecture for live order signals, notifications, websocket subscriptions, publication scope, and reconnect behavior in Bạn Cá Bán Matcha.
---

# Supabase Realtime

Load the project `supabase` skill first. Realtime platform changes remain subject to its Prisma, authorization, RLS, and remote-operation boundaries.

## Architecture

Realtime is a change signal. It may notify the browser that an order row changed, but the API remains the source for authorized, joined, business-ready data.

- Subscribe in a client-side adapter or hook. Do not hold Realtime connections in Server Components, Route Handlers, or other short-lived serverless code.
- Do not render business data directly from `payload.new` or `payload.old`. On a relevant event, call the existing project API/service refresh path so authorization, DTO shaping, relations, and server rules remain intact.
- Use the project's existing Axios/service and state ownership. Do not add React Query, SWR, Zustand, or another state library solely to support Realtime.
- UI components must not import `@supabase/supabase-js` directly. Keep channel construction, status handling, and cleanup behind an adapter or hook.
- Cart state remains localStorage-owned. A Realtime event must not become a second cart or order source of truth.

## Subscription requirements

- Confirm the table is in the `supabase_realtime` publication before relying on database-change events. Publication changes are Supabase platform work and require explicit authority; they are not application-schema migrations.
- Limit schema, table, event, and filters to the feature's actual needs. RLS and grants still control exposure.
- Use a stable client per intended lifecycle. Remove the exact channel on cleanup to prevent duplicate listeners.
- After initial subscribe and every successful reconnect, refresh through the existing API path to catch events missed while disconnected.
- Treat duplicate, delayed, and out-of-order events as normal signals. Event handling must be idempotent and must not perform business mutations.
- Log no row payload, token, customer data, or secret. User-facing sound/toast behavior follows the mobile/UI owner and browser permission rules.

## Verification

Use the test lane authorized by `AGENTS.md` and `tdd`. Static or mock evidence can prove adapter behavior, cleanup, event filtering, and refresh calls; it cannot prove a deployed publication, RLS policy, network recovery, or provider delivery. Do not open a browser, start the dev server, or mutate a live Supabase project unless the task explicitly authorizes that operation.

When troubleshooting, distinguish:

- no event: publication, grants/RLS, filter, or channel status;
- stale UI: reconnect catch-up or the existing API refresh path;
- duplicate alerts: unstable client/channel lifecycle or missing cleanup;
- missing joined data: direct payload consumption instead of API refresh.
