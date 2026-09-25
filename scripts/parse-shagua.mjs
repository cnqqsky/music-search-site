import fs from 'node:fs';

const content = fs.readFileSync('D:/codex-list/WorkBuddy/音乐播放器/music-search-site/_shagua_full.html', 'utf-8');

const allUrls = content.match(/https?:\/\/[^\s"'<>]+/g) || [];
console.log('=== All URLs ===');
const uniqueUrls = [...new Set(allUrls)];
uniqueUrls.forEach(u => console.log(u));
console.log('\nTotal:', uniqueUrls.length);

const scripts = content.match(/<script[^>]*src=["'][^"']+["']/g) || [];
console.log('\n=== Script Tags ===');
scripts.forEach(s => console.log(s));
