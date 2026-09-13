/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
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
  },
};

export default nextConfig;