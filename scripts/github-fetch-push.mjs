#!/usr/bin/env node
/**
 * github-fetch-push.mjs — 纯 fetch 版 GitHub 整体同步提交。
 * 适用于本机 github.com:443 被封锁、且子进程 execFileSync 被沙箱限制的场景。
 *
 * 用法：
 *   GITHUB_TOKEN=xxx node scripts/github-fetch-push.mjs [--repo owner/name] [--branch main] [--message "..."] [--dry]
 *
 * 行为等价于一次完整场景同步：以 index 内容重建整棵树并移动分支 ref。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'D:/codex-list/WorkBuddy/音乐播放器/music-search-site';
const API = 'https://api.github.com';
const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) { console.error('✗ 缺少 GITHUB_TOKEN 环境变量'); process.exit(1); }

function parseArgs(argv) {
  const o = { repo: null, branch: null, message: null, dry: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--repo') o.repo = argv[++i];
    else if (a === '--branch') o.branch = argv[++i];
    else if (a === '--message') o.message = argv[++i];
    else if (a === '--dry') o.dry = true;
  }
  return o;
}

async function api(pathname, init) {
  const r = await fetch(API + pathname, {
    ...init,
    headers: {
      Authorization: 'Bearer ' + TOKEN,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'music-search-deploy',
      ...(init && init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init && init.headers),
    },
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`API ${r.status} ${pathname} -> ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}

// 收集待提交文件（跳过 .git 与本地产物）
const SKIP_DIR = new Set(['.git', '.wrangler', 'node_modules', '__pycache__']);
const SKIP_FILE = new Set(['diag-rank.mjs']);
function collect(dir, base, acc) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const rel = base ? base + '/' + name : name;
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (SKIP_DIR.has(name)) continue;
      collect(p, rel, acc);
    } else {
      if (name.endsWith('-out.txt')) continue;          // 脚本临时输出
      if (name.endsWith('.log')) continue;
      if (SKIP_FILE.has(name)) continue;
      acc.push(rel);
    }
  }
  return acc;
}

(async () => {
  const args = parseArgs(process.argv);
  const repo = args.repo || 'cnqqsky/music-search-site';
  const meta = await api(`/repos/${repo}`);
  const branch = args.branch || meta.default_branch;

  let parentSha = null;
  try {
    const ref = await api(`/repos/${repo}/git/ref/heads/${branch}`);
    parentSha = ref?.object?.sha || null;
  } catch { parentSha = null; }
  console.log(`→ 目标 ${repo}@${branch}${parentSha ? ' 父提交 ' + parentSha.slice(0, 7) : ' (空仓库)'}`);

  const files = collect(ROOT, '', []);
  console.log(`→ 待同步 ${files.length} 个文件`);
  if (args.dry) { console.log(files.join('\n')); return; }

  const tree = [];
  for (const rel of files) {
    const buf = fs.readFileSync(path.join(ROOT, rel));
    const blob = await api(`/repos/${repo}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({ content: buf.toString('base64'), encoding: 'base64' }),
    });
    tree.push({ path: rel.split(path.sep).join('/'), mode: '100644', type: 'blob', sha: blob.sha });
  }
  console.log(`→ 已创建 ${tree.length} 个 blob`);

  const created = await api(`/repos/${repo}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ tree }),
  });

  const commit = await api(`/repos/${repo}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message: args.message || `chore: sync from local (${new Date().toISOString().slice(0, 19).replace('T', ' ')})`,
      tree: created.sha,
      parents: parentSha ? [parentSha] : [],
    }),
  });
  console.log(`→ 提交 ${commit.sha.slice(0, 7)} 已创建`);

  if (parentSha) {
    await api(`/repos/${repo}/git/refs/heads/${branch}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: commit.sha, force: true }),
    });
  } else {
    await api(`/repos/${repo}/git/refs`, {
      method: 'POST',
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }),
    });
  }

  console.log(`✓ 已推送到 https://github.com/${repo}/commit/${commit.sha}`);
})().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });
