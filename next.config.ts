// next.config.ts — stable: no API redirect loops
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,

  images: {
    domains: ['localhost'],
    formats: ['image/webp', 'image/avif'],
  },

  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/react-slot'],
  },

  // Keep URLs without trailing slash (important for API)
  trailingSlash: false,

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]
  },

  // Keep ONLY the root redirect. Never redirect /api/**
  async redirects() {
    return [
      { source: '/', destination: '/login', permanent: false },
    ]
  },

  // 🔧 The fix: internally collapse any /api/**/ → /api/**
  // This is a rewrite (server-side routing), NOT a redirect, so no 308.
  async rewrites() {
    return [
      { source: '/api/:path*/', destination: '/api/:path*' },
    ]
  },
}

export default nextConfig
