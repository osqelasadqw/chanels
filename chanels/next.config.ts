import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    unoptimized: true,
    domains: ['lh3.googleusercontent.com', 'firebasestorage.googleapis.com', 'storage.googleapis.com', 'projec-cca43.firebasestorage.app'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.appspot.com',
      },
      {
        protocol: 'https',
        hostname: '*.firebasestorage.app',
      }
    ]
  },
  eslint: {
    // გამოვრთოთ ESLint შეცდომები დეპლოიმენტის დროს
    ignoreDuringBuilds: true,
  },
  typescript: {
    // ტიპების შემოწმების გამორთვა დეპლოიმენტის დროს
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
