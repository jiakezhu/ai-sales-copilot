import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const input = args[0];
const outAt = args.indexOf("--out");
const outDir = outAt >= 0 ? args[outAt + 1] : ".";
if (!input) {
  console.error("用法: node finalize-research.mjs <json> --out <directory>");
  process.exit(2);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(input);
const targetDir = path.resolve(outDir);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "deep-research-finalize-"));

function run(script, scriptArgs) {
  const result = spawnSync(process.execPath, [path.join(here, script), ...scriptArgs], { encoding: "utf8" });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) process.exitCode = result.status || 1;
  return result.status === 0;
}

let completed = false;
try {
  const gatePassed = run("quality-gate.mjs", [source]);
  const rendered = gatePassed && run("render-research.mjs", [source, "--out", tempDir]);
  const mdTemp = path.join(tempDir, "company-deep-research.md");
  const htmlTemp = path.join(tempDir, "company-deep-research.html");
  const verified = rendered && run("verify-deliverables.mjs", [source, mdTemp, htmlTemp]);
  if (verified) {
    fs.mkdirSync(targetDir, { recursive: true });
    fs.copyFileSync(mdTemp, path.join(targetDir, "company-deep-research.md"));
    fs.copyFileSync(htmlTemp, path.join(targetDir, "company-deep-research.html"));
    console.log(`交付完成：${targetDir}`);
    completed = true;
  }
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
if (!completed) process.exit(process.exitCode || 1);
