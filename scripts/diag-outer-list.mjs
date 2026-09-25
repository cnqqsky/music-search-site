// 批量实测：网易 outer 外链对每首歌的真实跳转目标
// 目的：确认"外链可用"与"外链 302 到 404"的比例，以及可用时的 Location 形态

const IDS = process.argv.slice(2).map((x) => x.split(':'));
const LIST = IDS.length
  ? IDS
  : [
      ['66476', '偏偏喜欢你/陈百强'],
      ['1438835565', '偏偏喜欢你(女声版)/阿梨粤'],
      ['1811356055', '偏偏喜欢你(Live)/张智霖'],
      ['5264846', '偏偏喜欢你/区瑞强'],
      ['3423784134', '偏偏喜欢你(R&B版)/王奕承'],
      ['347230', '海阔天空/Beyond'],
      ['186016', '晴天/周杰伦'],
      ['1330348068', '起风了/买辣椒也用券'],
    ];

async function probeOuter(id) {
  const url = `https://music.163.com/song/media/outer/url?id=${id}.mp3`;
  try {
    const r = await fetch(url, { redirect: 'manual' });
    const loc = r.headers.get('location') || '';
    return { id, status: r.status, loc };
  } catch (e) {
    return { id, status: 'ERR', loc: e.message };
  }
}

(async () => {
  for (const [id, name] of LIST) {
    const r = await probeOuter(id);
    const is404 = /\/404\/?$/.test(r.loc) || /\/404\?/.test(r.loc);
    const isCdn = /(music\.126\.net|126\.net)/.test(r.loc);
    let cdnInfo = '';
    if (r.status >= 300 && r.status < 400 && r.loc && !is404) {
      try {
        const rr = await fetch(r.loc, { headers: { Range: 'bytes=0-2047' } });
        const b = await rr.arrayBuffer();
        cdnInfo = ` | CDN ${rr.status} ${rr.headers.get('content-type')} ${b.byteLength}B`;
      } catch (e) {
        cdnInfo = ' | CDN ERR ' + e.message;
      }
    }
    console.log(
      `${r.status === 302 ? '302' : String(r.status).padEnd(3)} ${isCdn ? '[CDN ]' : is404 ? '[404 ]' : '[??  ]'} ${id.padStart(11)} ${name}`
      + `\n        -> ${(r.loc || '(无 Location)').slice(0, 130)}${cdnInfo}`
    );
  }
})();
