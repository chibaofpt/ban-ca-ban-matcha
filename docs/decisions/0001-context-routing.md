# 0001 — Nạp ngữ cảnh theo owner

Status: Accepted
Date: 2026-09-11

## Context

Người dùng yêu cầu review và sửa project skills/Markdown để rành mạch, ít context nhưng giữ ngữ nghĩa.
API skill lặp schema/UI/test rules và chứa mẫu code mâu thuẫn contract. Spec tổng chứa nhiều flow
độc lập, khiến task nhỏ dễ nạp cả tài liệu. Quyết định này giới hạn ở lớp tài liệu/harness.

## Decision

Giữ tên root docs và skill hiện có. AGENTS định tuyến; mỗi loại thông tin có một owner. Skill giữ
workflow/core rules, reference chỉ nạp theo nhánh; tách feature UI khỏi shared architecture.
Domain skills tiếp tục sở hữu business specification. ADR giữ lý do dài hạn, không nạp mỗi task.

## Alternatives

- Một tài liệu lớn: ít file nhưng nạp nhiều phần ngoài scope và dễ lặp rule.
- OpenSpec/Spec Kit đầy đủ: có workflow proposal/spec/plan/tasks, nhưng task hiện tại cần tối ưu
  tài liệu đã có; chưa có nhu cầu thêm CLI, dependency hay artifact theo từng change.
- Mỗi rule một file: giảm từng file nhưng tăng số lần tìm và ghép ngữ cảnh.

## Consequences

Đường đọc ngắn hơn cho task cục bộ; link/owner cần bảo trì khi tách hoặc thay rule.
Rút ngắn tài liệu không chứng minh runtime đúng. Giữ điểm chưa đủ bằng chứng trong NOTES.
Xem xét lại khi nhiều repo/team cần chia sẻ spec hoặc task dài cần lưu proposal độc lập.

## Current owners và tham khảo

[AGENTS](../../AGENTS.md), [spec registry](../specs/README.md), [decision policy](README.md).
Tham khảo progressive disclosure của [Agent Skills](https://github.com/agentskills/agentskills),
phân vai tài liệu của [Adobe harness guide](https://github.com/adobe/ai-repo-harness-guide),
[OpenSpec](https://github.com/Fission-AI/OpenSpec), [Spec Kit](https://github.com/github/spec-kit)
và context/consequences của [ADR](https://github.com/architecture-decision-record/architecture-decision-record).
