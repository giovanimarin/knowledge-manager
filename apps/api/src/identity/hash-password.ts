import { readFileSync } from "node:fs";
import { hashPassword, password } from "./security.js";

try {
  const value = readFileSync(0, "utf8").replace(/\n$/, "");
  console.log(await hashPassword(password(value)));
} catch {
  console.error("Invalid bootstrap password");
  process.exitCode = 1;
}
