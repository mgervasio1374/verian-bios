import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep pdf-parse / pdfjs-dist as runtime Node externals instead of bundling
  // them into the SSR chunk. pdfjs-dist references DOMMatrix at module-eval time,
  // which is undefined in the serverless runtime; bundling it poisoned every
  // server action on routes that transitively included lib/pdf/extract-text.ts.
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist'],
};

export default nextConfig;
