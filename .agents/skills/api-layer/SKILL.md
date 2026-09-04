---
name: api-layer
description: >
  Standardizes the full API layer for Bạn Cá Bán Matcha — Next.js 16 App Router.
  Use this skill whenever creating a new API route, frontend service, route handler,
  reorganizing how API calls are made in views/components, changing an API contract,
  renaming an endpoint or payload field, or considering a schema change for an API feature.
  Trigger on: "write api", "create route", "call api", "fetch data", "service layer",
  "api client", "organize api", "rename api", "change field", "add column",
  or any request involving data flow between frontend and backend in this project.
---

# API Layer Skill

> `API.md` owns contracts; `SPECIFICATION.md` owns architecture; `STRUCTURE.md` owns placement.

## Contract and Schema Preservation

`API.md` is authoritative for backend paths, methods, request fields, response shapes, HTTP
statuses, error codes, and `details` payloads. This skill does not rename or simplify that
contract. Resolve a conflict against `API.md` before changing a consumer or route.

- Inspect existing routes, services, shared types, tests, Prisma fields, and migrations before
  designing a change.
- Reuse an existing endpoint and payload shape when it can support the approved behavior.
- Do not rename an API route, HTTP method, request field, response field, or feature solely for
  naming consistency or refactoring convenience.
- Prefer internal refactoring and backward-compatible extensions over breaking contract changes.
- Reuse existing schema fields and relations before proposing a new table or column. Do not add
  duplicate totals or convenience snapshots when existing immutable data can derive the value.
- For any necessary breaking API or schema change, first document why the current contract cannot
  work, affected consumers, migration/backward compatibility, and rollback; obtain explicit user
  approval before implementation.

---

## Frontend — src/services/

**Rules:**
- One file per domain: `{domain}Service.ts` (e.g. `menuService.ts`, `orderService.ts`)
- Only layer allowed to know API URLs — declare as `const URL = { ... } as const` at top of file
- Always use `apiClient` from `src/lib/api/client.ts` — never create another Axios instance
- Always declare return types explicitly — never let TypeScript infer from Axios response
- Views and feature containers call services. Leaf UI and `src/components/ui` never call services directly.

**Axios instance (`src/lib/api/client.ts`):** use the existing implementation. Do not add a
default base URL, force a global `Content-Type`, or copy this illustrative block into production;
multipart requests depend on per-request headers.
```typescript
import axios from "axios";

export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

// Auto-retry once with refresh token on 401
apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      await axios.post("/api/auth/refresh", {}, { withCredentials: true });
      return apiClient(original);
    }
    return Promise.reject(error);
  }
);
```

**Shared types (`src/lib/types/api.ts`):**
```typescript
export type ApiResponse<T> = { data: T };
export type ApiError<TDetails = unknown> = {
  error: string;
  code: string;
  details?: TDetails;
};
```

`ApiError<TDetails>` is only the shared server payload. It does not carry HTTP status or define a
runtime error class.

**Service pattern:**
```typescript
// src/services/orderService.ts
import { apiClient } from "@/src/lib/api/client";
import type { ApiError, ApiResponse } from "@/src/lib/types/api";
import type { Order } from "@/src/lib/types/order";

const URL = {
  base: "/api/orders",
  byId: (id: string) => `/api/orders/${id}`,
} as const;

/** Error exposed by the order service after a structured server response. */
export class ApiServiceError<TDetails = unknown> extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details?: TDetails,
  ) {
    super(message);
    this.name = "ApiServiceError";
  }
}

/** Fetch all orders for the current user */
export async function getOrders(): Promise<Order[]> {
  const res = await apiClient.get<ApiResponse<Order[]>>(URL.base);
  return res.data.data;
}

/** Create a new order from cart */
export async function createOrder(payload: CreateOrderPayload): Promise<Order> {
  const res = await apiClient.post<ApiResponse<Order>>(URL.base, payload);
  return res.data.data;
}
```

**Consumer error preservation:** `ApiServiceError` is the existing exported `Error` subclass in
`src/services/orderService.ts`; do not create a shared runtime error class in
`src/lib/types/api.ts`. When the service translates a server `ApiError`, pass `apiError.error` as
the constructor `message`, so callers receive it as standard `Error.message`, while preserving
the HTTP `status`, `code`, and optional `details` on the subclass. Do not replace a structured
server error with a generic client string before its consumer can act on it.
For `422 BUSINESS_RULE_VIOLATION`, preserve `details.reason` exactly as defined in `API.md`.
Service tests assert the outbound URL/method/payload, successful response/DTO unwrapping, and
this preserved error shape; rendered UI/UX is manually accepted under the TDD policy.

---

## Backend — app/api/**/route.ts

Follow the contract in `API.md`, including documented status and error-code mappings. Backend
errors use `{ error, code }` and may include canonical `details`; a business-rule rejection uses
`422 BUSINESS_RULE_VIOLATION` with `details.reason` when `API.md` defines that reason. Never
move error payload into `data`, invent a replacement code, or drop the documented detail merely
because a current consumer does not render it.

**Mandatory order — never swap steps:**
1. Parse body with `.catch(() => null)`
2. Zod validate → return `400 VALIDATION_ERROR` if fail
3. `getSession(req)` → return `401 UNAUTHORIZED` if null
4. Role check → return `403 FORBIDDEN` if insufficient
5. Business logic — always `prisma.$transaction()` for multi-step writes
6. Return `{ data: T }` on success

**Route pattern:**
```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createOrderSchema } from "@/lib/validations/order";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  const parsed = createOrderSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid input", code: "VALIDATION_ERROR" },
      { status: 400 }
    );

  const session = await getSession(req);
  if (!session)
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 }
    );

  if (session.role !== "CUSTOMER")
    return NextResponse.json(
      { error: "Forbidden", code: "FORBIDDEN" },
      { status: 403 }
    );

  const result = await prisma.$transaction(async (tx) => {
    // business logic here
  });

  return NextResponse.json({ data: result }, { status: 201 });
}
```

**Zod schemas — `lib/validations/{domain}.ts` (no `.schema` suffix):**
```typescript
// lib/validations/auth.ts
const phoneSchema = z
  .string()
  .regex(/^(0|\+84)\d{9}$/)
  .transform((val) => (val.startsWith("0") ? `+84${val.slice(1)}` : val));

export const registerSchema = z.object({
  name: z.string().min(2).max(100),
  phone_number: phoneSchema,
  password: z.string().min(8).max(128),
});
```

**Error codes — use exactly, never invent new ones:**

| HTTP | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Zod parse failed |
| 401 | `UNAUTHORIZED` | No session / expired token |
| 403 | `FORBIDDEN` | Insufficient role |
| 404 | `NOT_FOUND` | Resource does not exist |
| 409 | `CONFLICT` | Duplicate (phone, token, ...) |
| 422 | `BUSINESS_RULE_VIOLATION` | Insufficient points, expired voucher, ... |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

---

## Commit Checklist

**New backend route:**
- [ ] Confirmed no existing route can support the feature without unnecessary duplication
- [ ] Zod validates input before any DB access
- [ ] `getSession()` called before business logic
- [ ] Role checked explicitly
- [ ] Multi-step DB in `prisma.$transaction()`
- [ ] Response is `{ data: T }` or `{ error, code }`
- [ ] No internal IDs exposed — `qr_token` only

**New frontend service:**
- [ ] Preserves existing endpoint paths and payload field names unless a breaking change was approved
- [ ] File at `src/services/{domain}Service.ts`
- [ ] Uses `apiClient` from `@/src/lib/api/client`
- [ ] URLs in `const URL = { ... } as const`
- [ ] Return type declared explicitly
- [ ] No imports from `lib/`

**New view/component:**
- [ ] View at `src/views/{Name}Page.tsx` — calls service, owns state
- [ ] Leaf UI receives props; a domain feature container may call a service as defined by `SPECIFICATION.md`
- [ ] Page entry at `app/**/{route}/page.tsx` — re-exports view, zero logic
- [ ] Page exports `metadata` with title + description
