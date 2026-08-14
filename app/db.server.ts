import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
  });
}

/** Lazily construct so importing this module cannot crash cold starts. */
export function getPrisma(): PrismaClient {
  if (process.env.NODE_ENV !== "production") {
    if (!global.prismaGlobal) {
      global.prismaGlobal = createPrismaClient();
    }
    return global.prismaGlobal;
  }

  if (!global.prismaGlobal) {
    global.prismaGlobal = createPrismaClient();
  }
  return global.prismaGlobal;
}

const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrisma();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export default prisma;
