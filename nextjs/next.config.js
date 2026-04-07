/** @type {import('next').NextConfig} */
const path = require("path");

const nextConfig = {
  reactStrictMode: true,
  // Pin the workspace root so Next doesn't auto-detect a parent lockfile
  turbopack: {
    root: __dirname,
  },
  // sql.js + xlsx are server-external (only used client-side)
  serverExternalPackages: ["sql.js"],
};

module.exports = nextConfig;
