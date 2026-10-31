// Build the Cloudflare Pages site (marketing + tutorial + support + Expo web).
//
// Sources (read from git main, so this works with back/ deleted on this branch):
//   back/bots/templates/{marketing,tutorial,support}.html
//   back/bots/static/**  -> site/dist/static/
//   front/dist/**        -> site/dist/app/  (run `expo export` first; see README)
//
// Usage:
//   node site/build.mjs --from-main   # templates + static via `git show main:<path>`
//   node site/build.mjs --local       # templates + static from ./back on disk
//                                     # (operator restored back/ manually)
//
// No dependencies: node stdlib only.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, posix, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SITE_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(SITE_DIR); // repo root
const DIST = join(SITE_DIR, "dist");

const FROM_MAIN = process.argv.includes("--from-main") || !process.argv.includes("--local");

function gitShowMain(repoPath) {
  // Binary-safe: return Buffer.
  return execFileSync("git", ["show", `main:${repoPath}`], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
}

function gitListMain(repoDir) {
  const out = execFileSync("git", ["ls-tree", "-r", "--name-only", "main", repoDir], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return out.split("\n").map((l) => l.trim()).filter(Boolean);
}

function readSource(repoPath, localPath) {
  if (!FROM_MAIN) return readFileSync(join(ROOT, localPath));
  return gitShowMain(repoPath);
}

// Django -> static HTML: drop {% load static %}, rewrite {% static 'X' %} -> /static/X.
function deDjango(html) {
  return html
    .replace(/{%\s*load\s+static\s*%}/g, "")
    .replace(/{%\s*static\s+['"]([^'"]+)['"]\s*%}/g, "/static/$1");
}

// Convert the Django support form to a static fetch form:
// - <form method="post" ...> -> <form id="support-form" ...> (no POST to Django)
// - drop {% csrf_token %} / {{ form ... }} leftovers
// - append a status line + fetch script posting JSON to /api/support.
const SUPPORT_SCRIPT = `<p id="support-status" class="mt-4 text-sm text-gray-300" role="status" aria-live="polite"></p>
<script>
(function () {
  var form = document.getElementById("support-form");
  var status = document.getElementById("support-status");
  if (!form) return;
  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    var data = {
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      subject: form.subject.value.trim(),
      message: form.message.value.trim()
    };
    if (status) { status.textContent = "Sending…"; }
    try {
      var res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error("bad status " + res.status);
      form.reset();
      if (status) { status.textContent = "Thank you for your message. We will be in touch shortly."; }
    } catch (err) {
      if (status) { status.textContent = "Sorry — something went wrong. Please try again later."; }
    }
  });
})();
</script>`;

function staticSupportForm(html) {
  let out = html.replace(/<form([^>]*)method=(["']?)post\2([^>]*)>/i, "<form$1$3>");
  out = out.replace(/<form([^>]*)>/i, (m, attrs) =>
    /\bid=/.test(attrs) ? m : `<form id="support-form"${attrs}>`,
  );
  out = out.replace(/{%\s*csrf_token\s*%}/g, "");
  out = out.replace(/{{\s*form[^}]*}}/g, "");
  if (!out.includes('id="support-form"')) {
    throw new Error("support template: no <form> found to convert");
  }
  for (const name of ["name", "email", "subject", "message"]) {
    if (!out.includes(`name="${name}"`)) throw new Error(`support template: field "${name}" missing`);
  }
  if (!out.includes("support-status")) {
    out = out.replace(/<\/form>/i, "</form>\n    " + SUPPORT_SCRIPT);
  }
  return out;
}

function writeFile(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function buildPages() {
  const marketing = deDjango(readSource("back/bots/templates/marketing.html", "back/bots/templates/marketing.html").toString("utf8"));
  const tutorial = deDjango(readSource("back/bots/templates/tutorial.html", "back/bots/templates/tutorial.html").toString("utf8"));
  const supportRaw = readSource("back/bots/templates/support.html", "back/bots/templates/support.html").toString("utf8");
  const support = staticSupportForm(deDjango(supportRaw));

  writeFile(join(DIST, "index.html"), marketing);
  writeFile(join(DIST, "tutorial", "index.html"), tutorial);
  writeFile(join(DIST, "support", "index.html"), support);
  console.log("pages: / + /tutorial/ + /support/");
}

function buildStatic() {
  const dest = join(DIST, "static");
  rmSync(dest, { recursive: true, force: true });
  if (FROM_MAIN) {
    for (const repoPath of gitListMain("back/bots/static")) {
      const rel = repoPath.slice("back/bots/static/".length);
      writeFile(join(dest, ...rel.split("/")), gitShowMain(repoPath));
    }
  } else {
    cpSync(join(ROOT, "back", "bots", "static"), dest, { recursive: true });
  }
  console.log(`static: ${readdirSync(dest).length} top-level entries -> /static/`);
}

function buildApp() {
  const src = join(ROOT, "front", "dist");
  const dest = join(DIST, "app");
  rmSync(dest, { recursive: true, force: true });
  if (!existsSync(src)) {
    console.log("app: front/dist missing (expo export not run?) — skipping /app/");
    return [];
  }
  cpSync(src, dest, { recursive: true });
  console.log("app: front/dist -> /app/");
  // Collect expo static-export pages (*.html) for per-route _redirects.
  const pages = [];
  const walk = (dir, base = "") => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = base ? `${base}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(join(dir, entry.name), rel);
      else if (entry.isFile() && entry.name.endsWith(".html")) pages.push(rel);
    }
  };
  walk(dest);
  return pages.sort();
}

function buildRedirects(appPages) {
  const lines = [
    "# /api/* is NOT handled here: the syftlearning.app/api/* Worker route owns it.",
    "# /app/* fallback mirrors Django web_app: /app/foo -> /app/foo.html -> /app/index.html.",
  ];
  for (const page of appPages) {
    if (page === "index.html") continue; // /app/ served natively
    const route = "/app/" + page.slice(0, -".html".length).split(sep).join(posix.sep);
    if (route.endsWith("/index")) continue; // /app/foo/ served natively
    lines.push(`${route}  /app/${page.split(sep).join(posix.sep)}  200`);
  }
  lines.push("/app/*  /app/index.html  200");
  writeFile(join(DIST, "_redirects"), lines.join("\n") + "\n");
  console.log(`redirects: ${lines.length - 2} page rule(s) + /app/* fallback`);
}

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
buildPages();
buildStatic();
buildRedirects(buildApp());
console.log(`done: ${DIST} (source: ${FROM_MAIN ? "git main" : "local back/"})`);
