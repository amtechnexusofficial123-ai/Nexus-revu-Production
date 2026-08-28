import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

let _db: Db | undefined;

/**
 * Lazy so `next build` / OpenNext can collect page data without DATABASE_URL
 * being present at build time. Cloudflare only needs the var at runtime.
 */
function getDb(): Db {
  if (_db) return _db;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  // Neon's HTTP driver works on Cloudflare Workers (no TCP sockets).
  _db = drizzle(neon(databaseUrl), { schema });
  return _db;
}

export const db = new Proxy({} as Db, {
  get(_target, prop, _receiver) {
    const instance = getDb();
    const value = Reflect.get(instance, prop, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
