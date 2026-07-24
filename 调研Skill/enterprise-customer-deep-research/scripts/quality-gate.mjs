import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const input = process.argv[2];
if (!input) {
  console.error("用法: node quality-gate.mjs <json>");
  process.exit(2);
}

const here = path.dirname(fileURLToPath(import.meta.url));
for (const script of ["validate-research.mjs", "audit-research-quality.mjs"]) {
  const result = spawnSync(process.execPath, [path.join(here, script), path.resolve(input)], { encoding: "utf8" });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    console.error(`交付门禁已停止：${script} 未通过。`);
    process.exit(result.status || 1);
  }
}
console.log("交付门禁通过：Schema 与研究质量均合格。");
