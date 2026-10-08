import { mkdirSync } from "node:fs";

mkdirSync("build", { recursive: true });
mkdirSync("build/client", { recursive: true });
mkdirSync("build/server", { recursive: true });
