# 0006 — Fusion original powder and manual rollout

Status: Accepted
Date: 2026-10-08

## Context

Automatic fallback obscured the original price anchor and required admin price recalculation.
The user approved a separate temporary serving default, restoration when the original returns,
replacement configuration for paused Fusion items, and mandatory original powder configuration.
The user explicitly instructed: “bạn khoá lại việc món fusion bắt buộc phải có bột mặc định”
and “Về việc migration thì bạn không cần bận tâm vì tôi sẽ sửa thủ công sau”.

## Decision

Keep the original price anchor and store an explicit temporary replacement separately.
The stricter create/merged-edit contract is part of that approved business change, including
the corresponding admin form/consumer update; there is no legacy null-original creation mode.
The additive Prisma migration is necessary for replacement storage even if all originals exist.
It does not choose original powders or backfill replacements. Data correction remains manual.

Deployment must account for existing invalid rows before publishing the new resolver.
The initial read-only MCP inspection found legacy data exceptions. A subsequent recheck on
2026-10-08 confirmed all 9 production and 8 staging Fusion items had an existing active original,
including paused items; no data backfill was needed for that checked state.

## Alternatives

Automatic backfill from the old fallback was not selected: the user reserved correction for manual
handling, and the chosen powder can change pricing. Continuing fallback would violate the approved
explicit selection and restoration behavior.

## Consequences

Application rollback may retain the additive nullable column. Do not guess or automatically undo
original/replacement selections; review anchors and availability mutations before restoring older
fallback behavior. Revisit rollout if manual correction cannot finish before application activation.

Current owners: [pricing rules](../../.agents/skills/pricing-logic/SKILL.md#powder-rules),
[API contract](../../API.md#powder-and-anchored-latte-availability-mutations),
[schema semantics](../../SCHEMA.md#menu_items).
