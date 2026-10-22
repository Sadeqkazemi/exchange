import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Prototype logic relies on componentDidMount running once (timers, rate drift).
  reactStrictMode: false,
  images: { unoptimized: true },
};

export default nextConfig;
