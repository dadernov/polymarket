import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    /**
     * Клиентский кэш уже отрисованных страниц. По умолчанию динамические
     * страницы не кэшируются вовсе (`dynamic: 0`), поэтому возврат к ранее
     * открытой категории каждый раз уходил на сервер заново. Полминуты —
     * безопасный запас: котировки на карточках всё равно обновляются
     * собственными запросами, а лента событий за это время не устаревает.
     */
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
  images: {
    // Картинки рынков лежат в S3 и CDN Polymarket. Аватары трейдеров приходят
    // с произвольных хостов, поэтому они рисуются обычным <img> в <Avatar>.
    remotePatterns: [
      { protocol: "https", hostname: "polymarket-upload.s3.us-east-2.amazonaws.com" },
      { protocol: "https", hostname: "polymarket-upload.s3.amazonaws.com" },
      { protocol: "https", hostname: "**.polymarket.com" },
    ],
  },
};

export default nextConfig;
