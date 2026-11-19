/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export", // fully static: `next build` writes plain HTML/JS to ./out
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default nextConfig;
