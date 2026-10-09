import { spawnSync } from "node:child_process";

function run(label, command, args) {
  console.log(`\n> ${label}: ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("prisma generate", "npx", ["prisma", "generate"]);

if (process.env.VERCEL) {
  console.log("Skipping prisma migrate deploy on Vercel builds.");
} else if (process.env.DIRECT_URL) {
  run("prisma migrate deploy", "npx", ["prisma", "migrate", "deploy"]);
}

run("remix vite:build", "npx", ["remix", "vite:build"]);
run("verify manifest", "node", ["scripts/verify-vercel-remix-manifest.mjs"]);
