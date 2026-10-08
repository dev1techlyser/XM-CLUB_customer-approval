import { existsSync } from "node:fs";

const manifest = ".vercel/remix-build-result.json";

if (!existsSync(manifest)) {
  console.error(
    "ERROR: Missing .vercel/remix-build-result.json after remix vite:build.",
  );
  console.error(
    "Vercel Remix framework cannot deploy routes — check build logs for remix vite:build errors.",
  );
  process.exit(1);
}

console.log("OK: .vercel/remix-build-result.json present.");
