// 탑툰 요일별/완결 웹툰 목록을 공개 페이지 조각(HTML fragment)에서 가져와
// toptoon-webtoon.json / toptoon-webtoon-finished.json으로 저장합니다.
// 탑툰 썸네일 CDN(smurfs.toptoon.com)은 외부 사이트에서 바로 불러오면(hotlink) 403을 반환하므로,
// 여기서 Referer를 붙여 직접 다운로드해 toptoon-thumbs/ 폴더에 로컬로 저장합니다.
// 실행: node scrape-toptoon.js
const fs = require('fs');
const path = require('path');

const DAY_NUMS = { 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat', 7: 'sun' };
const DAY_LABELS = { mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토', sun: '일' };
const THUMB_DIR = path.join(__dirname, 'toptoon-thumbs');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function extForUrl(url) {
  const m = url.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  return m ? m[1].toLowerCase() : 'jpg';
}

async function downloadThumb(url, destPath) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://toptoon.com/' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buf);
}

// 탑툰 CDN의 hotlink 차단(외부 Referer 차단, PerimeterX 봇 차단)을 피하기 위해
// 썸네일을 로컬로 내려받고 entry.thumb을 상대 경로로 바꿔치기합니다.
async function localizeThumbnails(entries) {
  if (!fs.existsSync(THUMB_DIR)) fs.mkdirSync(THUMB_DIR, { recursive: true });
  const cache = new Map();
  let done = 0;
  let failed = 0;
  for (const entry of entries) {
    if (!entry.thumb) continue;
    const originalUrl = entry.thumb;
    if (cache.has(originalUrl)) {
      entry.thumb = cache.get(originalUrl);
      continue;
    }
    const filename = `${entry.contentId}.${extForUrl(originalUrl)}`;
    const destPath = path.join(THUMB_DIR, filename);
    const relPath = `toptoon-thumbs/${filename}`;
    if (!fs.existsSync(destPath)) {
      try {
        await downloadThumb(originalUrl, destPath);
        await sleep(150);
      } catch (e) {
        console.warn(`  썸네일 다운로드 실패 (${entry.title}): ${e.message}`);
        failed += 1;
        continue;
      }
    }
    cache.set(originalUrl, relPath);
    entry.thumb = relPath;
    done += 1;
  }
  console.log(`  -> 썸네일 ${done}개 저장, ${failed}개 실패 (실패 시 원래 URL 유지)`);
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'X-Requested-With': 'XMLHttpRequest' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function parseItems(html) {
  const items = [];
  const liRegex = /<li class="serial__item jsComicObj"\s+data-comic-idx="(\d+)"\s+data-comic-id="([^"]+)"[\s\S]*?<\/li>/g;
  let m;
  while ((m = liRegex.exec(html))) {
    const [block, idx, comicId] = m;
    const thumbMatch = block.match(/background-image:url\(([^)]*)\)/);
    const titleMatch = block.match(/<p class="serial__title-text">([^<]*)<\/p>/);
    const title = titleMatch ? titleMatch[1].trim() : '';
    if (!title) continue;
    items.push({
      idx,
      comicId,
      thumb: thumbMatch ? thumbMatch[1].trim() : '',
      title,
    });
  }
  return items;
}

function toEntry({ idx, comicId, thumb, title }, extra) {
  const entry = {
    title,
    url: `https://toptoon.com/comic/ep_list/${comicId}`,
    platform: 'toptoon',
    contentId: idx,
    ...extra,
  };
  if (thumb) entry.thumb = thumb;
  return entry;
}

(async () => {
  const weekday = {};
  for (const [num, day] of Object.entries(DAY_NUMS)) {
    console.log(`[toptoon] ${day} 요일 수집 중...`);
    const html = await fetchHtml(`https://toptoon.com/weekly/getWeeklyHtml/${num}`);
    const items = parseItems(html);
    weekday[day] = items.map(it => toEntry(it, { day, dayLabel: DAY_LABELS[day] }));
    console.log(`  -> ${weekday[day].length}개`);
    await sleep(400);
  }
  console.log('[toptoon] 완결 목록 수집 중...');
  const completeHtml = await fetchHtml('https://toptoon.com/complete/getCompleteHtml/comicTotalComplete');
  const completedItems = parseItems(completeHtml);
  const finishedEntries = completedItems.map(it => toEntry(it, { section: 'finished', sectionLabel: '완결', status: 'finished' }));
  console.log(`  -> ${finishedEntries.length}개`);

  const allEntries = [...Object.values(weekday).flat(), ...finishedEntries];
  console.log(`[toptoon] 썸네일 이미지 로컬 저장 중 (${allEntries.length}개 항목)...`);
  await localizeThumbnails(allEntries);

  fs.writeFileSync(
    path.join(__dirname, 'toptoon-webtoon.json'),
    JSON.stringify({ toptoon: weekday }, null, 2),
    'utf8'
  );
  fs.writeFileSync(
    path.join(__dirname, 'toptoon-webtoon-finished.json'),
    JSON.stringify({ toptoon: { finished: finishedEntries } }, null, 2),
    'utf8'
  );
  console.log('[toptoon] 완료');
})().catch(err => {
  console.error('[toptoon] 실패:', err);
  process.exit(1);
});
