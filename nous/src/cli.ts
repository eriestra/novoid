// CLI entry point: npx tsx src/cli.ts <file.html>
import { readFileSync } from "node:fs";
import { analyze } from "./index.js";

const file = process.argv[2];
if (!file) {
  console.error("Usage: tsx src/cli.ts <file.html>");
  process.exit(1);
}

const html = readFileSync(file, "utf-8");
const report = analyze(html);
report.document = file;

console.log(JSON.stringify(report, null, 2));
