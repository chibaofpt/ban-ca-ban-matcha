import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import Navbar from "@/src/components/common/Navbar";
import AuthModal from "@/src/components/common/AuthModal";
import AuthGuardProvider from "@/src/components/common/AuthGuardProvider";
import StoreStatusBanner from "@/src/components/common/StoreStatusBanner";
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

const title = "Bạn Cá Bán Matcha – Tiên phong văn hóa Matcha tại Bình Dương";
const description =
  "Thưởng thức vị matcha chuẩn Nhật đầu tiên tại Thủ Dầu Một, Bình Dương. Trải nghiệm matcha ceremonial grade được pha chế thủ công từ Bạn Cá Bán Matcha.";

export const metadata: Metadata = {
  metadataBase: new URL("https://ban-ca-ban-matcha.vercel.app"),
  title: {
    default: title,
    template: "%s | Bạn Cá Bán Matcha",
  },
  description,
  keywords:
    "matcha ngon, matcha Thủ Dầu Một, matcha ceremonial grade, matcha Bình Dương, matcha local bình dương, Bạn Cá Bán Matcha",
  openGraph: {
    title,
    description,
    type: "website",
    locale: "vi_VN",
    images: [
      {
        url: "/logo.png",
        width: 800,
        height: 600,
        alt: "Bạn Cá Bán Matcha Logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/logo.png"],
  },
  alternates: {
    canonical: "https://ban-ca-ban-matcha.vercel.app",
  },
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "BCBM",
    statusBarStyle: "default",
  },
};

/** Root layout component wrapping all pages with common providers. */
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
      <body className="min-h-full flex flex-col bg-paper text-foreground font-sans overflow-x-hidden border-border transition-colors duration-300 text-ink">
        <AuthGuardProvider>
          <Navbar />
          <AuthModal />
          <main className="flex-1 pt-16">
            <StoreStatusBanner />
            {children}
          </main>
          <Toaster richColors position="top-center" />
        </AuthGuardProvider>
      </body>
    </html>
  );
}
