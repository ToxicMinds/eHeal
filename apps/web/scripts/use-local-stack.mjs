// Points the web app at the local Supabase stack by writing .env.local (not committed).
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const raw = execSync("supabase status -o json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
const status = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
writeFileSync(
  new URL("../.env.local", import.meta.url),
  `NEXT_PUBLIC_SUPABASE_URL=${status.API_URL}\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${status.PUBLISHABLE_KEY}\n`,
);
console.log(`web app now builds against ${status.API_URL}`);
