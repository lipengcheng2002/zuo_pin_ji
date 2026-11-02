import { promises as fs } from "node:fs";
import path from "node:path";

const root = process.cwd();
const appDir = path.join(root, "src", "app");
const globalsPath = path.join(appDir, "globals.css");
const start = "/* @tailwind-sources:start */";
const end = "/* @tailwind-sources:end */";

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (/\.(tsx?|jsx?)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

const files = (await walk(path.join(root, "src"))).sort();
const lines = files.map((file) => {
  const relative = path.relative(appDir, file).replaceAll("\\", "/");
  return `@source "${relative}";`;
});

const css = await fs.readFile(globalsPath, "utf8");
const block = `${start}\n${lines.join("\n")}\n${end}`;
let next;
const startIndex = css.indexOf(start);
const endIndex = css.indexOf(end);
if (startIndex >= 0 && endIndex > startIndex) {
  next = css.slice(0, startIndex) + block + css.slice(endIndex + end.length);
} else {
  next = css.replace('@import "tailwindcss";', `@import "tailwindcss";\n${block}`);
}
if (next !== css) await fs.writeFile(globalsPath, next, "utf8");
console.log(`tailwind sources synced: ${lines.length} files`);
