// 탑툰 요일별/완결 웹툰 목록을 공개 페이지 조각(HTML fragment)에서 가져와
// toptoon-webtoon.json / toptoon-webtoon-finished.json으로 저장합니다.
// 실행: node scrape-toptoon.js
const fs = require('fs');
const path = require('path');

const DAY_NUMS = { 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat', 7: 'sun' };
const DAY_LABELS = { mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토', sun: '일' };

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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
  fs.writeFileSync(
    path.join(__dirname, 'toptoon-webtoon.json'),
    JSON.stringify({ toptoon: weekday }, null, 2),
    'utf8'
  );

  console.log('[toptoon] 완결 목록 수집 중...');
  const completeHtml = await fetchHtml('https://toptoon.com/complete/getCompleteHtml/comicTotalComplete');
  const completedItems = parseItems(completeHtml);
  const finishedEntries = completedItems.map(it => toEntry(it, { section: 'finished', sectionLabel: '완결', status: 'finished' }));
  fs.writeFileSync(
    path.join(__dirname, 'toptoon-webtoon-finished.json'),
    JSON.stringify({ toptoon: { finished: finishedEntries } }, null, 2),
    'utf8'
  );
  console.log(`  -> ${finishedEntries.length}개`);
  console.log('[toptoon] 완료');
})().catch(err => {
  console.error('[toptoon] 실패:', err);
  process.exit(1);
});
