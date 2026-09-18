#!/usr/bin/env node
/**
 * github-api-push.mjs — 在本机 github.com:443 被代理封锁时，改用 api.github.com
 * 的 Git Data API 完成一次「整体同步式提交」（等价于 force push，但保留父子历史）。
 *
 * 用法：
 *   node scripts/github-api-push.mjs [--repo owner/name] [--branch main]
 *                                    [--message "提交说明"] [--dry]
 *
 * 行为：
 *   1. 用 `git ls-files` 取当前索引里的全部文件（已遵守 .gitignore）
 *   2. 逐个创建 blob（base64，兼容二进制）
 *   3. 建一棵**不含 base_tree** 的新树 → 远端旧文件会被清除，实现完整同步
 *   4. 以远端当前 HEAD 为父提交建 commit，再移动分支 ref
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const out = { repo: null, branch: null, message: null, dry: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--repo") out.repo = argv[++i];
    else if (a === "--branch") out.branch = argv[++i];
    else if (a === "--message") out.message = argv[++i];
    else if (a === "--dry") out.dry = true;
  }
  return out;
}

function gh(args, input) {
  return execFileSync("gh", ["api", ...args], {
    input: input === undefined ? undefined : input,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

function ghJson(args, input) {
  const raw = gh(args, input);
  return raw.trim() ? JSON.parse(raw) : null;
}

const args = parseArgs(process.argv);

// 1. 仓库 / 分支
let repo = args.repo;
if (!repo) {
  try {
    const url = execFileSync("git", ["remote", "get-url", "origin"], { encoding: "utf8" }).trim();
    const m = url.match(/github\.com[:/](.+?)(?:\.git)?$/);
    if (m) repo = m[1];
  } catch {}
}
if (!repo) {
  console.error("✗ 无法推断仓库，请用 --repo owner/name 指定");
  process.exit(1);
}
const [owner, name] = repo.split("/");
const repoPath = `repos/${owner}/${name}`;

const meta = ghJson([repoPath, "--jq", "{default_branch}"]);
const branch = args.branch || meta.default_branch;

// 2. 远端当前 HEAD（可能为空仓库）
let parentSha = null;
try {
  const ref = ghJson([`${repoPath}/git/ref/heads/${branch}`]);
  parentSha = ref?.object?.sha || null;
} catch {
  parentSha = null;
}
console.log(`→ 目标 ${repo}@${branch}${parentSha ? ` (父提交 ${parentSha.slice(0, 7)})` : " (空仓库)"}`);

// 3. 文件清单
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 })
  .split("\u0000")
  .filter(Boolean);
console.log(`→ 索引内 ${files.length} 个文件`);

if (args.dry) {
  console.log(files.join("\n"));
  process.exit(0);
}

// 4. 逐个建 blob
const tree = [];
for (const p of files) {
  const buf = readFileSync(p);
  const blob = ghJson([`${repoPath}/git/blobs`, "--method", "POST", "--input", "-"],
    JSON.stringify({ content: buf.toString("base64"), encoding: "base64" }));
  tree.push({ path: p.split("\\").join("/"), mode: "100644", type: "blob", sha: blob.sha });
}
console.log(`→ 已创建 ${tree.length} 个 blob`);

// 5. 建树（不带 base_tree → 完全同步，远端多余文件被清除）
const created = ghJson([`${repoPath}/git/trees`, "--method", "POST", "--input", "-"],
  JSON.stringify({ tree }));

// 6. 建提交
const commit = ghJson([`${repoPath}/git/commits`, "--method", "POST", "--input", "-"],
  JSON.stringify({
    message: args.message || `chore: sync from local (${new Date().toISOString().slice(0, 19).replace("T", " ")})`,
    tree: created.sha,
    parents: parentSha ? [parentSha] : [],
  }));
console.log(`→ 提交 ${commit.sha.slice(0, 7)} 已创建`);

// 7. 移动分支指针
if (parentSha) {
  ghJson([`${repoPath}/git/refs/heads/${branch}`, "--method", "PATCH", "--input", "-"],
    JSON.stringify({ sha: commit.sha, force: true }));
} else {
  ghJson([`${repoPath}/git/refs`, "--method", "POST", "--input", "-"],
    JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }));
}

// 8. 同步本地远端跟踪 ref，让 git status 显示为 up-to-date
try {
  execFileSync("git", ["update-ref", `refs/remotes/origin/${branch}`, commit.sha]);
} catch {}

console.log(`✓ 已推送到 https://github.com/${repo}/commit/${commit.sha}`);
