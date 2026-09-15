/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // SWC ya está habilitado por defecto en Next 14; el minify también
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Compresión gzip/brotli automática
  compress: true,
  // Optimización de imágenes — formato WebP/AVIF, sin carga innecesaria
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'instagram.com' },
      { protocol: 'https', hostname: 'i.instagram.com' },
      { protocol: 'https', hostname: 'ytimg.com' },
      { protocol: 'https', hostname: 'i.ytimg.com' },
      { protocol: 'https', hostname: 'scontent-*' },
      { protocol: 'https', hostname: 'fbcdn.net' },
      { protocol: 'https', hostname: 'video-cdn.fbcdn.net' },
    ],
    formats: ['image/webp', 'image/avif'],
    minimumCacheTTL: 31536000, // 1 año
    deviceSizes: [320, 400, 600, 750, 800, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  // Headers de caché para assets estáticos críticos
  async headers() {
    return [
      {
        source: '/_next/static/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/fonts/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
  // Experimental optimizations for Next 14
  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons', 'framer-motion'],
  },
  // Bundle analyzer en desarrollo (solo si se instala)
  webpack: (config, { dev, isServer }) => {
    // Optimizar imports de lodash y similares
    if (config.resolve.alias) {
      config.resolve.alias['lodash'] = 'lodash-es';
    }
    // Reducir bundle en desarrollo omitiendo source maps pesados
    if (dev && !isServer) {
      config.devtool = 'eval';
    }
    return config;
  },
};

export default nextConfig;
