// Mock for 'server-only' package in test environment.
// In Next.js production builds this throws if imported client-side;
// in tests we simply no-op to allow server modules to be unit-tested.
export {}
