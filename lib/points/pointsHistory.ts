export type PointsActorRole = "CUSTOMER" | "STAFF" | "ADMIN";

export interface PointsHistoryLog {
  id: string;
  delta: number;
  reason: string;
  order_id: string | null;
  created_at: Date;
  order: { total_vnd: number; order_code: string | null } | null;
  voucher: { package: { name: string } } | null;
  staff: { name: string; role: PointsActorRole } | null;
}

export interface PointsHistoryEvent {
  id: string;
  kind: "order_reward" | "order_reversal" | "other";
  reason: string;
  total_delta: number;
  order_points: number;
  surplus_points: number;
  created_at: string;
  order: { order_code: string | null; points_base_vnd: number } | null;
  voucher: { package_name: string } | null;
  actor: { name: string; role: PointsActorRole } | null;
}

export interface GroupedPointsHistory {
  events: PointsHistoryEvent[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

function getEventKind(reason: string): PointsHistoryEvent["kind"] {
  if (reason === "order_complete" || reason === "voucher_surplus") {
    return "order_reward";
  }
  if (
    reason === "order_complete_reversed" ||
    reason === "voucher_surplus_reversed"
  ) {
    return "order_reversal";
  }
  return "other";
}

function isNewer(log: PointsHistoryLog, event: PointsHistoryEvent): boolean {
  const timeDifference = log.created_at.getTime() - new Date(event.created_at).getTime();
  return timeDifference > 0 || (timeDifference === 0 && log.id > event.id);
}

function toEvent(log: PointsHistoryLog): PointsHistoryEvent {
  const kind = getEventKind(log.reason);
  return {
    id: log.id,
    kind,
    reason: log.reason,
    total_delta: log.delta,
    order_points:
      log.reason === "order_complete" || log.reason === "order_complete_reversed"
        ? log.delta
        : 0,
    surplus_points:
      log.reason === "voucher_surplus" || log.reason === "voucher_surplus_reversed"
        ? log.delta
        : 0,
    created_at: log.created_at.toISOString(),
    order: log.order
      ? {
          order_code: log.order.order_code,
          points_base_vnd: log.order.total_vnd,
        }
      : null,
    voucher: log.voucher
      ? { package_name: log.voucher.package.name }
      : null,
    actor: log.staff
      ? { name: log.staff.name, role: log.staff.role }
      : null,
  };
}

/** Groups immutable point logs into customer-facing events before paginating them. */
export function groupPointsHistory(
  logs: PointsHistoryLog[],
  page: number,
  limit: number,
): GroupedPointsHistory {
  const groups = new Map<string, PointsHistoryEvent>();

  for (const log of logs) {
    const kind = getEventKind(log.reason);
    const canGroup = kind !== "other" && log.order_id !== null;
    const key = canGroup ? `${kind}:${log.order_id}` : `log:${log.id}`;
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, toEvent(log));
      continue;
    }

    existing.total_delta += log.delta;
    if (log.reason === "order_complete" || log.reason === "order_complete_reversed") {
      existing.order_points += log.delta;
    }
    if (log.reason === "voucher_surplus" || log.reason === "voucher_surplus_reversed") {
      existing.surplus_points += log.delta;
    }
    if (!existing.order && log.order) {
      existing.order = {
        order_code: log.order.order_code,
        points_base_vnd: log.order.total_vnd,
      };
    }
    if (isNewer(log, existing)) {
      existing.id = log.id;
      existing.reason = log.reason;
      existing.created_at = log.created_at.toISOString();
      existing.actor = log.staff
        ? { name: log.staff.name, role: log.staff.role }
        : null;
    }
  }

  const events = [...groups.values()].sort((left, right) => {
    const timeDifference =
      new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    return timeDifference !== 0 ? timeDifference : right.id.localeCompare(left.id);
  });
  const total = events.length;
  const offset = (page - 1) * limit;

  return {
    events: events.slice(offset, offset + limit),
    meta: {
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}
