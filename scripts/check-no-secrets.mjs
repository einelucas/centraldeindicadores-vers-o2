import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const ROOT = process.cwd();
const EXCLUDED = new Set([".git", ".next", "node_modules", "reference"]);
const TEXT_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".mjs", ".json", ".md", ".yml", ".yaml", ".prisma", ".env", "",
]);
const suspicious = [
  /postgres(?:ql)?:\/\/[^\s"']+:[^\s"']+@[^\s"']+neon\.tech/gi,
  /BETTER_AUTH_SECRET\s*=\s*["']?(?!CHANGE_ME)[^\s"']{16,}/gi,
];

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (EXCLUDED.has(entry.name)) continue;
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(fullPath)));
    else if (TEXT_EXTENSIONS.has(extname(entry.name))) files.push(fullPath);
  }
  return files;
}

let found = false;
for (const file of await walk(ROOT)) {
  const content = await readFile(file, "utf8").catch(() => null);
  if (content === null) continue;
  for (const pattern of suspicious) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) {
      console.error(`Possível segredo em ${relative(ROOT, file)}`);
      found = true;
    }
  }
}

if (found) process.exit(1);
console.log("Nenhuma credencial real conhecida foi encontrada.");
