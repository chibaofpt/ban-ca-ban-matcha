import { z } from "zod";

/** Regex for HH:mm 24-hour time format */
const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

const timeString = z
  .string()
  .regex(timeRegex, "Định dạng giờ không hợp lệ, cần HH:mm (vd: 08:30)");

const slotSchema = z
  .object({
    open_time: timeString,
    close_time: timeString,
  })
  .refine(
    (s) => {
      const [oh, om] = s.open_time.split(":").map(Number);
      const [ch, cm] = s.close_time.split(":").map(Number);
      return oh * 60 + om < ch * 60 + cm;
    },
    { message: "Giờ đóng cửa phải sau giờ mở cửa" },
  );

const dayScheduleSchema = z
  .object({
    day_of_week: z.number().int().min(0).max(6),
    slots: z.array(slotSchema).max(2, "Mỗi ngày tối đa 2 khung giờ"),
  })
  .refine(
    (d) => {
      if (d.slots.length < 2) return true;
      // Slot 2 must start after slot 1 ends
      const [oh2, om2] = d.slots[1].open_time.split(":").map(Number);
      const [ch1, cm1] = d.slots[0].close_time.split(":").map(Number);
      return oh2 * 60 + om2 >= ch1 * 60 + cm1;
    },
    { message: "Khung giờ 2 phải bắt đầu sau khi khung giờ 1 kết thúc" },
  );

/** Schema for PUT /api/admin/store-schedule */
export const updateStoreScheduleSchema = z.object({
  schedules: z
    .array(dayScheduleSchema)
    .min(1)
    .refine(
      (arr) => {
        const days = arr.map((d) => d.day_of_week);
        return new Set(days).size === days.length;
      },
      { message: "Không được trùng lặp day_of_week" },
    ),
});

export type UpdateStoreScheduleInput = z.infer<typeof updateStoreScheduleSchema>;

/** Schema for POST /api/admin/store-closure */
export const toggleStoreClosureSchema = z.object({
  action: z.enum(["close", "open"]),
  note: z.string().max(200).optional(),
});

export type ToggleStoreClosureInput = z.infer<typeof toggleStoreClosureSchema>;
