import type { NextConfig } from "next";

// Baseline security headers, codified in the repo rather than assumed from the
// hosting platform (audit finding). Deliberately conservative: no strict CSP in
// this pass — Next.js inline scripts need nonce plumbing first; add CSP as its
// own slice. SAMEORIGIN (not DENY) so any future internal framing keeps working
// while cross-origin clickjacking stays blocked — public /p/[token] proposal
// pages are link-opened, never embedded.
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options',    value: 'nosniff' },
  { key: 'X-Frame-Options',           value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  // Keep pdf-parse / pdfjs-dist as runtime Node externals instead of bundling
  // them into the SSR chunk. pdfjs-dist references DOMMatrix at module-eval time,
  // which is undefined in the serverless runtime; bundling it poisoned every
  // server action on routes that transitively included lib/pdf/extract-text.ts.
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist'],
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

export default nextConfig;
