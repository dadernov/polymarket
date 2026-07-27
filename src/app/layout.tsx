import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { CategoryBar } from "@/components/layout/category-bar";
import { Footer } from "@/components/layout/footer";
import { MobileNav } from "@/components/layout/mobile-nav";
import { TopNav } from "@/components/layout/top-nav";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

const display = Playfair_Display({
  variable: "--font-display",
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
    default: "Кворум — рынки вероятностей",
    template: "%s · Кворум",
  },
  description:
    "Читайте вероятности событий: политика, спорт, крипта и экономика. Живые котировки, стакан заявок и графики на публичных данных Polymarket.",
  applicationName: "Кворум",
  keywords: [
    "рынки предсказаний",
    "prediction markets",
    "вероятности событий",
    "котировки",
    "Polymarket API",
  ],
  openGraph: {
    type: "website",
    locale: "ru_RU",
    siteName: "Кворум",
    title: "Кворум — рынки вероятностей",
    description:
      "Живые вероятности по политике, спорту, крипте и экономике. Стакан заявок, графики и лидерборд трейдеров.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Кворум — рынки вероятностей",
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
    <html
      lang="ru"
      suppressHydrationWarning
      className={`${inter.variable} ${display.variable}`}
    >
      <body className="min-h-screen bg-bg font-sans text-text antialiased">
        <Providers>
          {/* Сайдбара больше нет: одна полоса контента на всю ширину.
              Снизу — место под мобильную панель навигации. */}
          <div className="flex min-h-screen flex-col pb-16 lg:pb-0">
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
