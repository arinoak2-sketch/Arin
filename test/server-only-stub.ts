// The `server-only` package throws when resolved outside a server build.
// Vitest runs plain Node, so it is aliased to this no-op. The guard still does
// its job in the Next.js build, which is the only place it matters.
export {}
