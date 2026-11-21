// Keep old root-level index.js as the CommonJS entry point alias.
// The real source is now in src/index.ts → compiled to lib/index.js.
// This file is intentionally left as a placeholder so the old build
// reference doesn't break if someone runs `node index.js` directly.
// After `npm run build`, use lib/index.js instead.
