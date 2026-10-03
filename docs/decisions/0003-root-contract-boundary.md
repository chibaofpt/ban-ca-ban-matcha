# Root contract boundary

Status: Accepted

Date: 2026-09-20

## Context

Frontend nằm trong `src/` và backend nằm trong `lib/`, nhưng API wire types được cả hai phía sử dụng.
Đặt các type này ở một phía làm phía còn lại phụ thuộc sai hướng hoặc phải duy trì bản sao dễ drift.

## Decision

Đặt shared API wire contracts tại root `contracts/`, chia module theo domain và import trực tiếp;
không tạo barrel tổng. `contracts/` chỉ sở hữu type/schema của dữ liệu qua HTTP, không sở hữu transport,
service, persistence, UI state hay business logic. TypeScript là mặc định; chỉ dùng Zod khi thật sự cần
runtime parsing ở wire boundary.

## Alternatives

- Giữ bản sao type trong `src/` và `lib/`: đơn giản cục bộ nhưng tạo hai nguồn sự thật và dễ drift.
- Gom tất cả vào một barrel/type file lớn: import ngắn hơn nhưng tăng coupling và blast radius.

## Consequences

Frontend và backend có một nguồn wire shape trung lập, đổi lại cần phân loại symbol cẩn thận và duy trì
import boundary. State/form/UI-only vẫn ở `src/`; Prisma payload, transaction và domain intermediate vẫn
ở `lib/`. Xem xét lại khi contract được publish thành package riêng hoặc runtime validation trở thành
yêu cầu phổ biến thay vì ngoại lệ.

## Current owners

- [Runtime architecture](../../SPECIFICATION.md#runtime-architecture)
- [Placement và import boundaries](../../STRUCTURE.md#import-boundaries)
- [API layer skill](../../.agents/skills/api-layer/SKILL.md)
