/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  // Netlify serverless deployment
  output: 'standalone',

  // Exclude native modules from bundling (they'll be loaded at runtime)
  serverExternalPackages: ['better-sqlite3', 'pg'],

  // Disable source maps in production
  productionBrowserSourceMaps: false,
};

export default nextConfig;