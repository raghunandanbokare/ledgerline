// Loads index.html's app script into a sandbox with the same React / Babel builds the
// page pulls from cdnjs (pinned in package.json), so tests can render components in Node.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const LIBS = [
  "react/umd/react.production.min.js",
  "react-dom/umd/react-dom-server-legacy.browser.production.min.js",
  "@babel/standalone/babel.min.js",
];

function loadApp({ search = "", beforeRun } = {}) {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const src = html.match(/<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/)[1]
    .replace(/ReactDOM\.createRoot\([\s\S]*?\);\s*$/, "");
  const ctx = { console, URLSearchParams, URL, TextEncoder, TextDecoder, setTimeout, clearTimeout };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  // UMD files aren't in the packages' "exports" map, so read them by path
  for (const lib of LIBS) vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "node_modules", lib), "utf8"), ctx);
  Object.assign(ctx, {
    location: { search },
    localStorage: { getItem: () => null, setItem() {} },
    fetch: () => Promise.reject(new Error("offline")),
    document: { getElementById: () => null },
    ReactDOM: {},
  });
  if (beforeRun) beforeRun(ctx.React);
  const code = ctx.Babel.transform(src, { presets: ["react"] }).code;
  vm.runInContext(code + ";globalThis.__app = { App, SetupWizard, SEED, SECTORS, STAGES, computeCapTable, computeWaterfall };", ctx);
  return {
    ...ctx.__app,
    React: ctx.React,
    renderToString: el => ctx.ReactDOMServer.renderToString(el),
  };
}

// Rendered HTML → readable text (drops React's text-node markers, decodes common entities)
const toText = h => h.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ")
  .replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
  .replace(/&[a-z#0-9]+;/g, " ").replace(/\s+/g, " ");

function checker() {
  let fails = 0;
  const expect = (name, ok, detail = "") => {
    if (!ok) fails++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  };
  const done = () => {
    console.log(fails ? `\n${fails} failing` : "\nall passing");
    process.exitCode = fails ? 1 : 0;
  };
  return { expect, done };
}

module.exports = { loadApp, toText, checker };
