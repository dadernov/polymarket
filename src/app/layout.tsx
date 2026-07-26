import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { CategoryBar } from "@/components/layout/category-bar";
import { Footer } from "@/components/layout/footer";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Sidebar } from "@/components/layout/sidebar";
import { TopNav } from "@/components/layout/top-nav";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

/**
 * Базовый адрес сайта. Нужен, чтобы canonical и ссылки OG/Twitter на страницах
 * событий стали абсолютными: без него Next подставляет localhost, и превью
 * ссылок в мессенджерах и поисковая индексация ломаются на реальном домене.
 *
 * На сервере достаточно задать SITE_URL=https://ваш-домен.ru — больше никаких
 * переменных окружения проекту не требуется.
 */
function siteUrl(): URL {
  const fallback = "http://localhost:3000";
  const raw =
    process.env.SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    fallback;
  try {
    return new URL(raw);
  } catch {
    return new URL(fallback);
  }
}

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: {
    default: "Polymarket — рынки предсказаний",
    template: "%s · Polymarket",
  },
  description:
    "Торгуйте вероятностями событий: политика, спорт, крипта и экономика. Живые котировки, стакан заявок и графики на данных Polymarket.",
  applicationName: "Polymarket",
  keywords: [
    "рынки предсказаний",
    "prediction markets",
    "Polymarket",
    "ставки на события",
    "вероятности",
  ],
  openGraph: {
    type: "website",
    locale: "ru_RU",
    siteName: "Polymarket",
    title: "Polymarket — рынки предсказаний",
    description:
      "Живые вероятности по политике, спорту, крипте и экономике. Стакан заявок, графики и лидерборд трейдеров.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Polymarket — рынки предсказаний",
    description: "Живые вероятности по политике, спорту, крипте и экономике.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning className={inter.variable}>
      <body className="min-h-screen bg-bg font-sans text-text antialiased">
        <Providers>
          <Sidebar />

          {/* Слева — место под фиксированный сайдбар, снизу — под мобильную панель. */}
          <div className="flex min-h-screen flex-col pb-16 lg:pb-0 lg:pl-[232px]">
            <TopNav />
            <CategoryBar />
            <main className="flex-1">{children}</main>
            <Footer />
          </div>

          <MobileNav />
        </Providers>
      </body>
    </html>
  );
}
