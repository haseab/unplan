import fs from "node:fs/promises";
import postcss from "postcss";
const source = await fs.readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const root = postcss.parse(source);
root.walkAtRules("import", (rule) => rule.remove());
root.walkRules((rule) => {
  if (rule.parent.type === "atrule" && /keyframes$/.test(rule.parent.name)) return;
  rule.selectors = rule.selectors.map((selector) => {
    if (selector.includes(":root"))
      return selector.replaceAll(
        ":root",
        rule.parent.type === "atrule" && /max-width/.test(rule.parent.params)
          ? ".unplan-root .calendar-shell"
          : ".unplan-root",
      );
    if (selector === "html" || selector === "body") return ".unplan-root";
    return `.unplan-root ${selector}`;
  });
});
root.walkDecls((decl) => {
  decl.value = decl.value.replace(/([0-9.]+)vw/g, "$1cqw").replace(/([0-9.]+)vh/g, "$1cqh");
  if (decl.prop === "width" && decl.value === "100cqw") decl.value = "100%";
  if (decl.prop === "height" && decl.value === "100cqh") decl.value = "100%";
});
root.append(
  postcss.parse(`
.unplan-root { --font-geist-sans: "Unplan Embedded Geist"; --font-geist-mono: "Unplan Embedded Geist Mono"; display: flex; flex-direction: column; position: relative; width: 100%; height: 100%; min-width: 0; min-height: 0; isolation: isolate; contain: layout paint; container-type: size; }
.unplan-root .calendar-shell { width: 100%; flex: 1 1 0; min-height: 0; height: auto; }
.unplan-root .topbar { flex-wrap: wrap; height: auto; min-height: 57px; flex: 0 0 auto; row-gap: 6px; padding-block: 8px; }
.unplan-root .topbar-left, .unplan-root .topbar-right { min-width: 0; max-width: 100%; flex-wrap: wrap; row-gap: 6px; }
.unplan-root .sync-state { position: static; left: auto; transform: none; flex: 0 0 auto; max-width: 100%; }

.unplan-root .bb-unplan-connection { position: static; flex: 0 0 auto; max-width: 100%; background: var(--paper); border-bottom: 1px solid var(--line-strong); padding: 8px 12px; font-size: 12px; }
`),
);
root.walkAtRules("media", (rule) => {
  if (/max-width:/.test(rule.params)) rule.name = "container";
});
const names = new Map();
root.walkAtRules("keyframes", (rule) => {
  const name = rule.params;
  names.set(name, `unplan-${name}`);
  rule.params = `unplan-${name}`;
});
root.walkDecls((decl) => {
  if (decl.prop === "animation" || decl.prop === "animation-name") {
    for (const [name, scoped] of names)
      decl.value = decl.value.replace(new RegExp(`(?<![\\w-])${name}(?![\\w-])`, "g"), scoped);
  }
});
root.append(
  postcss.parse(`
@container (max-width: 620px) {
  .unplan-root .calendar-shell { flex-direction: column; }
  .unplan-root .calendar-workspace { flex: 1 1 0; min-height: 0; }
  .unplan-root .right-sidebar-header, .unplan-root .right-sidebar-content { width: 100%; min-width: 0; }
  .unplan-root .right-sidebar { position: relative; inset: auto; width: 100%; height: 36%; flex: 0 0 36%; min-height: 140px; max-height: 45%; border-left: 0; border-top: 1px solid var(--line-strong); box-shadow: none; }
}
`),
);
// Inline binary assets last: CSS unit rewrites can corrupt base64 sequences.
for (const [family, file] of [
  ["Unplan Embedded Geist", "geist-latin.woff2"],
  ["Unplan Embedded Geist Mono", "geist-mono-latin.woff2"],
]) {
  const data = (await fs.readFile(new URL(`../assets/${file}`, import.meta.url))).toString("base64");
  root.prepend(
    postcss.parse(
      `@font-face { font-family: "${family}"; font-style: normal; font-weight: 100 900; font-display: swap; src: url("data:font/woff2;base64,${data}") format("woff2"); }`,
    ),
  );
}
const mark =
  "data:image/png;base64," + (await fs.readFile(new URL("../assets/unplan-mark.png", import.meta.url))).toString("base64");
root.walkDecls((decl) => {
  decl.value = decl.value.replace("/unplan-mark.png", mark);
});
await fs.writeFile(new URL("../dist/embedded.css", import.meta.url), root.toString());

async function copyCss(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const source = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
    if (entry.isDirectory()) await copyCss(source);
    else if (entry.name.endsWith(".css")) {
      const relative = source.pathname.slice(new URL("../src/", import.meta.url).pathname.length);
      const output = new URL("../dist/" + relative, import.meta.url);
      await fs.mkdir(new URL(".", output), { recursive: true });
      await fs.copyFile(source, output);
    }
  }
}
await copyCss(new URL("../src/", import.meta.url));
const googleImage = "data:image/png;base64," + (await fs.readFile(new URL("../assets/google-signin-light.png", import.meta.url))).toString("base64");
await fs.writeFile(new URL("../dist/asset-urls.js", import.meta.url), `export const googleSignInImage = ${JSON.stringify(googleImage)};\n`);
