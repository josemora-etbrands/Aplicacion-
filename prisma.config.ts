import "dotenv/config";
import { defineConfig } from "prisma/config";

function withSsl(url: string | undefined): string {
  if (!url) throw new Error("Missing database URL env var");
  return url.includes("sslmode") ? url : url + (url.includes("?") ? "&" : "?") + "sslmode=require";
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: withSsl(process.env["DATABASE_URL"]),
    directUrl: withSsl(process.env["DIRECT_URL"]),
  },
});
