import "dotenv/config";
import { defineConfig } from "prisma/config";

function withSsl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return url.includes("sslmode") ? url : url + (url.includes("?") ? "&" : "?") + "sslmode=require";
}

const dbUrl = withSsl(process.env["DATABASE_URL"]);
const directUrl = withSsl(process.env["DIRECT_URL"]);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  ...(dbUrl && {
    datasource: {
      url: dbUrl,
      ...(directUrl && { directUrl }),
    },
  }),
});
