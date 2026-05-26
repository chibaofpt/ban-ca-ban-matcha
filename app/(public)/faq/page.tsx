import React from 'react';
import { Metadata } from 'next';
import Footer from '@/src/components/common/Footer';

export const metadata: Metadata = {
  title: 'Câu Hỏi Thường Gặp (FAQ) — Bạn Cá Bán Matcha',
  description: 'Giải đáp các thắc mắc về Bạn Cá Bán Matcha: địa chỉ, giờ mở cửa, menu matcha chuẩn Nhật, giao hàng và các thông tin khác.',
  openGraph: {
    title: 'Câu Hỏi Thường Gặp (FAQ) — Bạn Cá Bán Matcha',
    description: 'Giải đáp các thắc mắc về Bạn Cá Bán Matcha: địa chỉ, giờ mở cửa, menu matcha chuẩn Nhật, giao hàng và các thông tin khác.',
  },
};

const faqs = [
  {
    question: "Bạn Cá Bán Matcha ở đâu? Giờ mở cửa?",
    answer: "Bạn Cá Bán Matcha nằm tại Khu dân cư Chánh Nghĩa, Thủ Dầu Một, Bình Dương. Chúng tôi mở cửa từ 8:00 đến 22:00 tất cả các ngày trong tuần."
  },
  {
    question: "Matcha tại Bạn Cá có phải matcha thật không?",
    answer: "Chắc chắn rồi. Chúng tôi sử dụng 100% bột Matcha Ceremonial Grade nhập khẩu trực tiếp từ Nhật Bản, không pha trộn hương liệu. Mỗi ly matcha đều được đánh thủ công bằng chổi chasen tre truyền thống ngay tại quầy."
  },
  {
    question: "Giá matcha tại Bạn Cá bao nhiêu?",
    answer: "Các dòng matcha tại quán có mức giá dao động từ 45.000VND đến 85.000VND tùy vào loại bột (Fusion hoặc Latte), kích cỡ (M, L, XL) và các loại topping kèm theo như kem hoặc đá dừa."
  },
  {
    question: "Matcha ceremonial grade là gì?",
    answer: "Matcha Ceremonial Grade (Matcha Hạng Nghi Lễ) là loại bột matcha cao cấp nhất, được dùng trong các trà thất truyền thống Nhật Bản. Lá trà được che nắng cẩn thận, thu hoạch bằng tay vào vụ xuân đầu tiên và xay mịn bằng cối đá, mang lại màu xanh ngọc lục bảo rực rỡ và hậu vị umami ngọt thanh, không đắng gắt."
  },
  {
    question: "Quán có giao hàng (delivery) không?",
    answer: "Hiện tại Bạn Cá Bán Matcha ưu tiên trải nghiệm thưởng thức trực tiếp tại không gian quán để đảm bảo hương vị và nhiệt độ tốt nhất của matcha. Bạn có thể theo dõi Fanpage để cập nhật khi có dịch vụ giao hàng qua app."
  }
];

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map(faq => ({
    '@type': 'Question',
    name: faq.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: faq.answer
    }
  }))
};

export default function FAQPage() {
  return (
    <main className="min-h-screen bg-background pt-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      
      <div className="max-w-3xl mx-auto px-6 py-12 md:py-20 space-y-12">
        <section className="text-center space-y-4">
          <h1 className="font-serif text-4xl md:text-5xl font-bold text-foreground">
            Câu Hỏi Thường Gặp <span className="text-primary">(FAQ)</span>
          </h1>
          <p className="text-lg text-foreground/80">
            Tổng hợp những giải đáp nhanh về Bạn Cá Bán Matcha.
          </p>
        </section>

        <section className="space-y-6">
          {faqs.map((faq, index) => (
            <div key={index} className="bg-primary/5 rounded-2xl p-6 md:p-8 space-y-4">
              <h2 className="font-serif text-xl md:text-2xl font-semibold text-foreground">
                {faq.question}
              </h2>
              <p className="text-foreground/80 leading-relaxed">
                {faq.answer}
              </p>
            </div>
          ))}
        </section>
      </div>
      
      <Footer />
    </main>
  );
}
