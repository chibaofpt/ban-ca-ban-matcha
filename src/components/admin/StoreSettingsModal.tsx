"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getStoreSchedule,
  updateStoreSchedule,
  closeStore,
  openStore,
} from "@/src/services/adminStoreService";
import type { DaySchedule } from "@/src/services/adminStoreService";
import { useBodyScrollLock } from "@/src/hooks/useBodyScrollLock";

const DAY_NAMES = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

interface StoreSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SlotDraft {
  open_time: string;
  close_time: string;
}

interface DayDraft {
  day_of_week: number;
  slots: SlotDraft[];
}

/** Fetch the actual current store status */
async function fetchStoreStatus(): Promise<{ is_open: boolean; reason: string; note: string | null }> {
  const res = await fetch("/api/store-status");
  const json = await res.json();
  return {
    is_open: json.data?.is_open ?? false,
    reason: json.data?.reason ?? "UNKNOWN",
    note: json.data?.closure_note ?? null,
  };
}

/** StoreSettingsModal — Admin-only modal for managing store hours and temporary closure. */
export default function StoreSettingsModal({ isOpen, onClose }: StoreSettingsModalProps) {
  const [schedule, setSchedule] = useState<DayDraft[]>(
    Array.from({ length: 7 }, (_, i) => ({ day_of_week: i, slots: [] })),
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Temporary closure state
  const [actualStatus, setActualStatus] = useState<{ is_open: boolean; reason: string; note: string | null } | null>(null);
  const [closureInput, setClosureInput] = useState("");
  const [closureLoading, setClosureLoading] = useState(false);
  const [closureError, setClosureError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [scheduleData, statusData] = await Promise.all([
        getStoreSchedule(),
        fetchStoreStatus(),
      ]);

      // Merge loaded schedule into draft (preserve all 7 days)
      const draft: DayDraft[] = Array.from({ length: 7 }, (_, i) => {
        const day = scheduleData.find((d: DaySchedule) => d.day_of_week === i);
        return {
          day_of_week: i,
          slots: day
            ? day.slots.map((s) => ({ open_time: s.open_time, close_time: s.close_time }))
            : [],
        };
      });
      setSchedule(draft);
      setActualStatus(statusData);
    } catch {
      // silently ignore — UI shows empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadData();
      setSaveError(null);
      setSaveSuccess(false);
      setClosureError(null);
      setClosureInput("");
    }
  }, [isOpen, loadData]);

  const handleSlotChange = (
    dayIdx: number,
    slotIdx: number,
    field: "open_time" | "close_time",
    value: string,
  ) => {
    setSchedule((prev) =>
      prev.map((day) => {
        if (day.day_of_week !== dayIdx) return day;
        const slots = [...day.slots];
        slots[slotIdx] = { ...slots[slotIdx], [field]: value };
        return { ...day, slots };
      }),
    );
  };

  const addSlot = (dayIdx: number) => {
    setSchedule((prev) =>
      prev.map((day) => {
        if (day.day_of_week !== dayIdx || day.slots.length >= 2) return day;
        return { ...day, slots: [...day.slots, { open_time: "17:00", close_time: "22:00" }] };
      }),
    );
  };

  const removeSlot = (dayIdx: number, slotIdx: number) => {
    setSchedule((prev) =>
      prev.map((day) => {
        if (day.day_of_week !== dayIdx) return day;
        return { ...day, slots: day.slots.filter((_, i) => i !== slotIdx) };
      }),
    );
  };

  const toggleDayOff = (dayIdx: number) => {
    setSchedule((prev) =>
      prev.map((day) => {
        if (day.day_of_week !== dayIdx) return day;
        // Toggle: if has slots → clear (day off); if no slots → add default slot
        return {
          ...day,
          slots: day.slots.length > 0 ? [] : [{ open_time: "06:00", close_time: "22:00" }],
        };
      }),
    );
  };

  const handleSaveSchedule = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      await updateStoreSchedule(schedule);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Lỗi khi lưu lịch";
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleCloseStore = async () => {
    setClosureLoading(true);
    setClosureError(null);
    try {
      await closeStore(closureInput || undefined);
      setActualStatus({ is_open: false, reason: "TEMPORARY_CLOSURE", note: closureInput || null });
      setClosureInput("");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Lỗi khi đóng cửa";
      setClosureError(msg);
    } finally {
      setClosureLoading(false);
    }
  };

  const handleOpenStore = async () => {
    setClosureLoading(true);
    setClosureError(null);
    try {
      await openStore();
      const newStatus = await fetchStoreStatus();
      setActualStatus(newStatus);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Lỗi khi mở cửa lại";
      setClosureError(msg);
    } finally {
      setClosureLoading(false);
    }
  };

  useBodyScrollLock(isOpen);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card w-full max-w-lg max-h-[90vh] overflow-y-auto touch-pan-y overflow-x-clip overscroll-x-none overscroll-contain rounded-2xl shadow-2xl border border-border">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 bg-card border-b border-border rounded-t-2xl">
          <h2 className="text-lg font-semibold text-foreground">⚙️ Cài đặt cửa hàng</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-muted transition text-muted-foreground"
            aria-label="Đóng"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* Section 1: Temporary Closure */}
          <section>
            <h3 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wide opacity-70">
              Trạng thái tạm thời
            </h3>
            {actualStatus ? (
              <div className={`rounded-xl border p-4 ${
                actualStatus.reason === "TEMPORARY_CLOSURE" ? "border-red-400/40 bg-red-500/5" : 
                !actualStatus.is_open ? "border-amber-400/40 bg-amber-500/5" :
                "border-green-400/40 bg-green-500/5"
              }`}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">
                    {actualStatus.reason === "TEMPORARY_CLOSURE" ? "🔴" : !actualStatus.is_open ? "🌙" : "🟢"}
                  </span>
                  <span className="font-medium text-sm">
                    {actualStatus.reason === "TEMPORARY_CLOSURE" ? "Đang tạm đóng cửa" : 
                     !actualStatus.is_open ? "Đang đóng cửa theo lịch" : "Đang mở cửa bình thường"}
                  </span>
                </div>
                
                {actualStatus.reason === "TEMPORARY_CLOSURE" && actualStatus.note && (
                  <p className="text-xs text-muted-foreground mb-3 italic">
                    Ghi chú: &ldquo;{actualStatus.note}&rdquo;
                  </p>
                )}

                {actualStatus.is_open && (
                  <div className="space-y-2">
                    <textarea
                      id="closure-note-input"
                      value={closureInput}
                      onChange={(e) => setClosureInput(e.target.value)}
                      onBlur={() => window.scrollTo(0, 0)}
                      placeholder="Ghi chú cho khách (không bắt buộc)... vd: Hôm nay có việc đột xuất, quay lại lúc 3h"
                      className="w-full text-sm rounded-lg border border-border bg-background px-3 py-2 resize-none h-16 focus:outline-none focus:ring-2 focus:ring-red-400/50"
                      maxLength={200}
                    />
                    <button
                      id="btn-close-store"
                      onClick={handleCloseStore}
                      disabled={closureLoading}
                      className="w-full py-2.5 rounded-lg bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-medium transition"
                    >
                      {closureLoading ? "Đang xử lý..." : "🔴 Đóng cửa ngay"}
                    </button>
                  </div>
                )}

                {actualStatus.reason === "TEMPORARY_CLOSURE" && (
                  <button
                    id="btn-open-store"
                    onClick={handleOpenStore}
                    disabled={closureLoading}
                    className="w-full py-2.5 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium transition"
                  >
                    {closureLoading ? "Đang xử lý..." : "🟢 Mở cửa lại"}
                  </button>
                )}

                {!actualStatus.is_open && actualStatus.reason !== "TEMPORARY_CLOSURE" && (
                  <p className="text-xs text-muted-foreground">
                    Không thể thao tác đóng cửa khi cửa hàng đang nghỉ. Nếu bạn muốn mở cửa ngay bây giờ, vui lòng điều chỉnh lịch ở bên dưới.
                  </p>
                )}

                {closureError && (
                  <p className="text-xs text-red-500 mt-2">{closureError}</p>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-4">Đang tải trạng thái...</div>
            )}
          </section>

          {/* Section 2: Weekly Schedule */}
          <section>
            <h3 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wide opacity-70">
              Lịch mở cửa hàng tuần
            </h3>
            {loading ? (
              <div className="text-sm text-muted-foreground text-center py-8">Đang tải...</div>
            ) : (
              <div className="space-y-3">
                {schedule.map((day) => {
                  const isDayOff = day.slots.length === 0;
                  return (
                    <div
                      key={day.day_of_week}
                      className={`rounded-xl border p-3 transition ${isDayOff ? "border-border opacity-60" : "border-border"}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">{DAY_NAMES[day.day_of_week]}</span>
                        <button
                          onClick={() => toggleDayOff(day.day_of_week)}
                          className={`text-xs px-2.5 py-1 rounded-full transition font-medium ${
                            isDayOff
                              ? "bg-muted text-muted-foreground hover:bg-primary/10"
                              : "bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/20 dark:text-red-400"
                          }`}
                        >
                          {isDayOff ? "+ Mở ngày này" : "Đặt nghỉ"}
                        </button>
                      </div>

                      {!isDayOff && (
                        <div className="space-y-2">
                          {day.slots.map((slot, slotIdx) => (
                            <div key={slotIdx} className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground w-12 shrink-0">
                                {slotIdx === 0 ? "Khung 1" : "Khung 2"}
                              </span>
                              <input
                                id={`day-${day.day_of_week}-slot-${slotIdx}-open`}
                                type="time"
                                value={slot.open_time}
                                onChange={(e) =>
                                  handleSlotChange(day.day_of_week, slotIdx, "open_time", e.target.value)
                                }
                                onBlur={() => window.scrollTo(0, 0)}
                                className="flex-1 text-sm border border-border rounded-lg px-2 py-1 bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                              />
                              <span className="text-xs text-muted-foreground">→</span>
                              <input
                                id={`day-${day.day_of_week}-slot-${slotIdx}-close`}
                                type="time"
                                value={slot.close_time}
                                onChange={(e) =>
                                  handleSlotChange(day.day_of_week, slotIdx, "close_time", e.target.value)
                                }
                                onBlur={() => window.scrollTo(0, 0)}
                                className="flex-1 text-sm border border-border rounded-lg px-2 py-1 bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                              />
                              {day.slots.length > 1 && (
                                <button
                                  onClick={() => removeSlot(day.day_of_week, slotIdx)}
                                  className="text-muted-foreground hover:text-red-500 transition p-1"
                                  aria-label="Xóa khung giờ"
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          ))}

                          {day.slots.length < 2 && (
                            <button
                              onClick={() => addSlot(day.day_of_week)}
                              className="text-xs text-primary hover:underline mt-1"
                            >
                              + Thêm khung giờ thứ 2
                            </button>
                          )}
                        </div>
                      )}

                      {isDayOff && (
                        <p className="text-xs text-muted-foreground">Ngày nghỉ</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Save button */}
            <div className="mt-4">
              {saveError && (
                <p className="text-xs text-red-500 mb-2">{saveError}</p>
              )}
              {saveSuccess && (
                <p className="text-xs text-green-600 mb-2">✅ Đã lưu lịch thành công!</p>
              )}
              <button
                id="btn-save-schedule"
                onClick={handleSaveSchedule}
                disabled={saving || loading}
                className="w-full py-2.5 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm font-medium transition"
              >
                {saving ? "Đang lưu..." : "Lưu lịch mở cửa"}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
