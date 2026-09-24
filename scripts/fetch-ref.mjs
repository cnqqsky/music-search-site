// 拉取 maicong/music 参考实现并提取各平台取链逻辑
import fs from 'node:fs';

const r = await fetch('https://raw.githubusercontent.com/maicong/music/master/core/music.php');
const php = await r.text();
fs.writeFileSync('scripts/_ref-music.php', php, 'utf8');
console.log('已保存', php.length, '字节');

// 提取酷狗相关函数
function extractFn(src, name) {
  const i = src.indexOf('function ' + name);
  if (i < 0) return null;
  let depth = 0, started = false, j = i;
  for (; j < src.length; j++) {
    if (src[j] === '{') { depth++; started = true; }
    else if (src[j] === '}') { depth--; if (started && depth === 0) { j++; break; } }
  }
  return src.slice(i, j);
}

const wanted = process.argv.slice(2);
const targets = wanted.length ? wanted : ['kugou', 'netease', 'qq'];
for (const name of targets) {
  const cands = [...php.matchAll(new RegExp('function\\s+(\\w*' + name + '\\w*)', 'g'))].map(m => m[1]);
  const uniq = [...new Set(cands)];
  console.log('\n===== ' + name + ' 相关函数: ' + uniq.join(', ') + ' =====');
  for (const fn of uniq.slice(0, 4)) {
    const body = extractFn(php, fn);
    if (body) console.log(body.slice(0, 1800));
  }
}
