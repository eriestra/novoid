// CLI entry point: npx tsx src/cli.ts <file.html>
import { readFileSync } from "node:fs";
import { analyze } from "./index.js";

const file = process.argv[2];
if (!file) {
  console.error("Usage: tsx src/cli.ts <file.html>");
  process.exit(1);
}

const html = readFileSync(file, "utf-8");
const contractMatch = html.match(/<script[^>]*data-nous-contracts[^>]*>([\s\S]*?)<\/script>/i);
const contracts = contractMatch ? JSON.parse(contractMatch[1]) : [];
const report = analyze(html, { contracts });
report.document = file;

console.log(JSON.stringify(report, null, 2));
