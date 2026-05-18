#!/usr/bin/env node
// Read-only progress dashboard for the autonomous loop.
//
// Threat model (the loop PC must never be put at risk):
//   - Binds to 127.0.0.1 ONLY. Nothing on the network can reach it
//     directly; a Cloudflare tunnel (outbound-only, no inbound port)
//     is the sole intended exposure path.
//   - Exactly two routes: GET / (the HTML) and GET /healthz. Every
//     other method/path -> 404. No path parameters, no file serving,
//     no directory listing, no traversal surface.
//   - The only child process is `git log` with a fixed argument
//     vector and zero request-derived input. No shell, no eval, no
//     writes — the process cannot mutate the repo or the system.
//   - Errors never leak internals to the client (project rule:
//     no raw-error info disclosure on a response).
//
// So even if the tunnel URL leaks, a visitor can see only the
// rendered progress HTML and nothing else.

import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.MUSE_DASHBOARD_PORT) || 8787;
const REFRESH_SECONDS = 30;
const SEP = String.fromCharCode(1);

const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

function git(args) {
  return new Promise((resolve) => {
    execFile(
      "git",
      args,
      { cwd: repoRoot, timeout: 5000, maxBuffer: 1024 * 1024 },
      (err, stdout) => resolve(err ? "" : stdout.trim()),
    );
  });
}

async function openGoals() {
  let md = "";
  try {
    md = await readFile(join(repoRoot, "docs/goals/README.md"), "utf8");
  } catch {
    return [];
  }
  const rows = [];
  for (const line of md.split("\n")) {
    const m = line.match(/^\|\s*(\d{3})\s*\|\s*\[([^\]]+)\]/);
    if (!m) continue;
    if (/\bdone\b/i.test(line) && !/slice/i.test(line)) continue;
    const status = (line.split("|")[4] || "").trim();
    rows.push({ id: m[1], title: m[2], status });
  }
  return rows;
}

async function shipped() {
  const raw = await git([
    "log",
    "-40",
    "--no-merges",
    `--pretty=format:%cI%x01%s`,
  ]);
  const out = [];
  for (const line of raw.split("\n")) {
    const [iso, subject = ""] = line.split(SEP);
    if (!iso) continue;
    out.push({ when: iso.slice(0, 16).replace("T", " "), subject });
  }
  return out;
}

function page({ goals, ship, head }) {
  const goalRows = goals.length
    ? goals
        .map(
          (g) =>
            `<tr><td class="id">${esc(g.id)}</td><td>${esc(g.title)}</td><td class="st">${esc(g.status || "open")}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="3" class="dim">no open goals parsed</td></tr>`;

  const done = ship.filter((s) => /goal\s*\d/i.test(s.subject)).slice(0, 5);
  const doneRows = done
    .map((s) => `<li><span class="when">${esc(s.when)}</span> ${esc(s.subject)}</li>`)
    .join("");
  const feed = ship
    .slice(0, 15)
    .map((s) => `<li><span class="when">${esc(s.when)}</span> ${esc(s.subject)}</li>`)
    .join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="${REFRESH_SECONDS}">
<title>Muse — what the loop is doing</title>
<style>
:root{color-scheme:dark}
body{font:15px/1.55 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto;margin:0;background:#0b0d12;color:#e6e9ef}
.wrap{max-width:880px;margin:0 auto;padding:32px 20px 64px}
h1{font-size:20px;margin:0 0 4px} .sub{color:#8b93a7;margin:0 0 28px;font-size:13px}
h2{font-size:14px;text-transform:uppercase;letter-spacing:.08em;color:#9aa3b8;margin:32px 0 10px;border-bottom:1px solid #1d2330;padding-bottom:6px}
table{width:100%;border-collapse:collapse} td{padding:7px 8px;border-bottom:1px solid #161b26;vertical-align:top}
.id{color:#6ea8fe;font-variant-numeric:tabular-nums;width:46px} .st{color:#8b93a7;font-size:13px;width:34%}
ul{list-style:none;margin:0;padding:0} li{padding:6px 0;border-bottom:1px solid #161b26;font-size:14px}
.when{color:#6b7280;font-variant-numeric:tabular-nums;margin-right:10px;font-size:12px}
.dim{color:#6b7280;text-align:center;padding:18px} .foot{margin-top:36px;color:#5b6373;font-size:12px}
</style></head><body><div class="wrap">
<h1>Muse — what the loop is doing</h1>
<p class="sub">Self-evolving development loop · auto-refreshes every ${REFRESH_SECONDS}s · HEAD <code>${esc(head || "?")}</code></p>
<h2>Open goals</h2>
<table>${goalRows}</table>
<h2>Recently shipped</h2>
<ul>${doneRows || `<li class="dim">nothing yet</li>`}</ul>
<h2>Latest activity</h2>
<ul>${feed || `<li class="dim">nothing yet</li>`}</ul>
<p class="foot">Read-only view. Generated from git history + docs/goals on each request.</p>
</div></body></html>`;
}

const server = createServer(async (req, res) => {
  try {
    if (req.method !== "GET") {
      res.writeHead(404).end("not found");
      return;
    }
    const path = (req.url || "/").split("?")[0];
    if (path === "/healthz") {
      res.writeHead(200, { "content-type": "text/plain" }).end("ok");
      return;
    }
    if (path !== "/") {
      res.writeHead(404).end("not found");
      return;
    }
    const [goals, ship, head] = await Promise.all([
      openGoals(),
      shipped(),
      git(["rev-parse", "--short", "HEAD"]),
    ]);
    const html = page({ goals, ship, head });
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
    res.end(html);
  } catch {
    res.writeHead(500, { "content-type": "text/plain" }).end("error");
  }
});

server.listen(PORT, "127.0.0.1", () => {
  process.stdout.write(
    `dashboard on http://127.0.0.1:${PORT} (127.0.0.1 only — expose via an outbound Cloudflare tunnel, never a port forward)\n`,
  );
});
