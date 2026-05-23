import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import Navbar from "@/src/components/common/Navbar";
import AuthModal from "@/src/components/common/AuthModal";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "vietnamese"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
});

const title = "Bánh Cá Bốn Mùa – Matcha & Bánh Cá Thủ Công";
const description =
  "Bánh cá và matcha ngon tại Thủ Dầu Một. Matcha ceremonial grade, đa dạng theo mùa. Thưởng thức vị matcha chuẩn Nhật giữa lòng Bình Dương.";

export const metadata: Metadata = {
  title,
  description,
  keywords:
    "matcha ngon, matcha Thủ Dầu Một, matcha ceremonial grade, matcha Bình Dương, bánh cá matcha",
  openGraph: {
    title,
    description,
    type: "website",
    locale: "vi_VN",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={`${inter.variable} ${playfair.variable} h-full antialiased scroll-smooth`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans overflow-x-hidden border-border transition-colors duration-300">
        <Navbar />
        <AuthModal />
        <main className="flex-1 pt-16">
          {children}
        </main>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
