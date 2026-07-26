import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
