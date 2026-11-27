import { readFile } from "node:fs/promises";

const licenses = JSON.parse(await readFile(process.argv[2], "utf8"));
const allowed = new Set([
  "MIT",
  "ISC",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "0BSD",
  "BlueOak-1.0.0",
  "CC-BY-4.0",
  "CC0-1.0",
  "Unlicense",
]);
const mplReviewed =
  /^lightningcss(?:-(?:darwin|linux|win32|freebsd|android)-[a-z0-9-]+)?$/;
const unknown = Object.entries(licenses)
  .filter(
    ([license, packages]) =>
      !allowed.has(license) &&
      !(
        license === "MPL-2.0" &&
        packages.every(({ name }) => mplReviewed.test(name))
      ) &&
      !(
        license === "(MIT AND Zlib)" &&
        packages.every(({ name }) => name === "pako")
      ),
  )
  .map(([license]) => license);
if (unknown.length || Object.keys(licenses).length === 0) {
  console.error("Review required for npm license expressions:", unknown);
  process.exitCode = 1;
} else {
  console.log(
    "Reviewed npm license expressions:",
    Object.keys(licenses).sort().join(", "),
  );
}
