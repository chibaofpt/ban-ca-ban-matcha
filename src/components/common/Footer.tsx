"use client";

import Image from "next/image";
import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Clock3, MapPin, Phone } from "lucide-react";
import { usePathname } from "next/navigation";
import { useStoreStatus } from "@/src/hooks/useStoreStatus";
import { formatTodaySchedule, getNextOpeningCountdown } from "@/src/lib/utils/storeHoursPresentation";

const MAP_EMBED_URL = "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3916.604035933183!2d106.66025757573023!3d10.99323078916905!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3174d100093b26e9%3A0x9d91bdfdb87d1818!2zQuG6oW4gQ8OhIELDoW4gTWF0Y2hh!5e0!3m2!1sen!2s!4v1789894325129!5m2!1sen!2s";
const MAP_URL = "https://www.google.com/maps/search/?api=1&query=10.99323078916905%2C106.66025757573023";

const Footer: React.FC = () => {
  const pathname = usePathname();
  const hideFooter = pathname.startsWith("/admin") || pathname.startsWith("/staff") || pathname.startsWith("/profile");
  const { data: storeStatus, isLoading, isError } = useStoreStatus({ enabled: !hideFooter });
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (hideFooter) return;
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, [hideFooter]);

  if (hideFooter) return null;

  const todayHours = storeStatus?.today_schedule.length
    ? formatTodaySchedule(storeStatus.today_schedule)
    : "Cửa hàng nghỉ";
  const countdown = storeStatus && !storeStatus.is_open && storeStatus.reason !== "TEMPORARY_CLOSURE"
    ? getNextOpeningCountdown(storeStatus.weekly_schedule, now)
    : null;

  return (
    <footer className="snap-end snap-always border-t border-border bg-background px-4 py-16 md:px-6 md:py-20">
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }} className="w-full"
        >
          <div className="text-center">
            <p className="font-serif text-3xl font-bold text-primary md:text-5xl">Bạn Cá Bán Matcha</p>
            <div className="mx-auto my-6 h-1 w-12 rounded-full bg-accent" />
            <p className="text-sm text-primary/70 md:text-base">Chiếc xe matcha nhật local nho nhỏ ở Bình Dương</p>
          </div>

          <div className="mt-10 border-t border-border/70 pt-6 text-sm text-primary/80">
            <p className="flex items-start gap-2 text-left"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span><strong>Địa chỉ:</strong> 35 Trương Định, Hiệp Thành, Thủ Dầu Một, Bình Dương</span></p>
            <div className="mt-5 flex items-end justify-between gap-4">
              <div className="space-y-3 text-left">
                <div className="flex items-start gap-2"><Clock3 className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><div>
                  <p><strong>Giờ mở cửa hôm nay:</strong> {isLoading ? "Đang tải..." : isError ? "Chưa thể tải" : todayHours}</p>
                  {storeStatus?.reason === "TEMPORARY_CLOSURE" && <p className="mt-1 text-xs text-primary/60">Đang tạm đóng cửa{storeStatus.closure_note ? `: ${storeStatus.closure_note}` : ""}</p>}
                  {countdown && <p className="mt-1 font-medium text-accent">Còn {countdown} nữa mở cửa</p>}
                </div></div>
                <a href="tel:0949129932" className="flex min-h-11 items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <Phone className="size-4" aria-hidden="true" /><span><strong>Điện thoại:</strong> 0949129932</span>
                </a>
              </div>
              <div className="flex shrink-0 gap-2" aria-label="Kênh truyền thông">
                <a href="https://web.facebook.com/profile.php?id=61554108474341" target="_blank" rel="noopener noreferrer" aria-label="Facebook của Bạn Cá Bán Matcha" className="flex size-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <Image src="/facebook.webp" alt="" width={36} height={36} />
                </a>
                <a href="https://www.tiktok.com/@bancabanmatcha/video/7658853728153292053" target="_blank" rel="noopener noreferrer" aria-label="TikTok của Bạn Cá Bán Matcha" className="flex size-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <Image src="/tiktok.png" alt="" width={36} height={36} />
                </a>
              </div>
            </div>
          </div>

          <div className="relative mt-6 h-60 overflow-hidden rounded-2xl border border-border shadow-sm md:h-80">
            <iframe src={MAP_EMBED_URL} title="Bản đồ Bạn Cá Bán Matcha" className="h-full w-full pointer-events-none" loading="lazy" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
            <a href={MAP_URL} target="_blank" rel="noopener noreferrer" aria-label="Mở vị trí Bạn Cá Bán Matcha trên Google Maps" className="absolute inset-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"><span className="sr-only">Mở Google Maps</span></a>
          </div>
          <p className="mt-10 text-center text-xs uppercase tracking-widest text-primary/40">© 2026 Bạn Cá Bán Matcha. All rights reserved.</p>
        </motion.div>
      </div>
    </footer>
  );
};

export default Footer;
