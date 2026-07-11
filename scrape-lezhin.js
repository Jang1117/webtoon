// 레진코믹스 요일별/완결 웹툰 목록을 공개 API에서 가져와 lezhin-webtoon.json / lezhin-webtoon-finished.json으로 저장합니다.
// 실행: node scrape-lezhin.js
const fs = require('fs');
const path = require('path');

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS = { mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토', sun: '일' };
const GENRE_LABELS = {
  fantasy: '판타지', romance: '로맨스', drama: '드라마', bl: 'BL', gl: 'GL',
  mature: '성인', thriller: '스릴러', comic: '개그', sports: '스포츠',
  day: '일상', horror: '호러', historical: '시대극', action: '액션',
};

async function fetchAll(filter) {
  const items = [];
  let offset = 0;
  const limit = 100;
  for (;;) {
    const res = await fetch(`https://api.lezhin.com/v2/content-list/weekday?filter=${filter}&offset=${offset}&limit=${limit}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for filter=${filter} offset=${offset}`);
    const json = await res.json();
    items.push(...(json.data || []));
    if (!json.hasNext) break;
    offset += limit;
    await sleep(400);
  }
  return items;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function toEntry(item, extra) {
  const author = (item.artists || []).map(a => a.name).filter(Boolean).join(', ');
  const genre = (item.genres || []).map(g => GENRE_LABELS[g] || g).join(', ');
  const entry = {
    title: item.title,
    url: `https://www.lezhin.com/ko/comic/${item.alias}`,
    thumb: `https://ccdn.lezhin.com/v2/comics/${item.id}/images/tall.jpg?updated=${item.updatedAt}&width=420`,
    platform: 'lezhin',
    contentId: String(item.id),
    ...extra,
  };
  if (author) entry.author = author;
  if (genre) entry.genre = genre;
  return entry;
}

(async () => {
  const weekday = {};
  for (const day of DAYS) {
    console.log(`[lezhin] ${day} 요일 수집 중...`);
    const items = await fetchAll(day);
    weekday[day] = items.map(it => toEntry(it, { day, dayLabel: DAY_LABELS[day] }));
    console.log(`  -> ${weekday[day].length}개`);
    await sleep(400);
  }
  fs.writeFileSync(
    path.join(__dirname, 'lezhin-webtoon.json'),
    JSON.stringify({ lezhin: weekday }, null, 2),
    'utf8'
  );

  console.log('[lezhin] 완결 목록 수집 중...');
  const completed = await fetchAll('completed');
  const finishedEntries = completed.map(it => toEntry(it, { section: 'finished', sectionLabel: '완결', status: 'finished' }));
  fs.writeFileSync(
    path.join(__dirname, 'lezhin-webtoon-finished.json'),
    JSON.stringify({ lezhin: { finished: finishedEntries } }, null, 2),
    'utf8'
  );
  console.log(`  -> ${finishedEntries.length}개`);
  console.log('[lezhin] 완료');
})().catch(err => {
  console.error('[lezhin] 실패:', err);
  process.exit(1);
});
