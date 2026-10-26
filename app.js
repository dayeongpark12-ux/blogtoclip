const $ = id => document.getElementById(id);
let tracks = [], data = {};

function parseSongs() {
  return $('songs').value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}

function applySongs() {
  const oldByName = {};
  tracks.forEach((t, i) => { oldByName[t.name] = data[i]; });
  
  tracks = parseSongs().map((name, i) => ({ name, order: i }));
  data = {};

  tracks.forEach((t, i) => {
    const existing = oldByName[t.name];
    data[i] = {
      // 기본값은 무조건 체크(true)
      selected: existing ? existing.selected : true,
      visibleCount: existing?.visibleCount || 3,
      allResults: existing?.allResults || [],
      candidates: existing?.candidates || []
    };
  });

  renderTracks();
  renderEditors();
  renderOutput();
}

async function findAlbumTracks(query) {
  // 1단계: iTunes 앨범 엔터티 직접 검색
  try {
    let res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=album&country=KR&limit=5`);
    let data = await res.json();
    if (data.results && data.results.length > 0) {
      const colId = data.results[0].collectionId;
      const colName = data.results[0].collectionName;
      const lookup = await fetch(`https://itunes.apple.com/lookup?id=${colId}&entity=song&country=KR`);
      const lData = await lookup.json();
      const songs = (lData.results || []).filter(item => item.wrapperType === 'track');
      if (songs.length > 0) return { albumName: colName, tracks: songs.map(s => s.trackName.trim()) };
    }
  } catch (e) {}

  // 2단계: 검색어 완화 (예: '의' 조사 제거 및 주요 키워드 추출)
  const simplified = query.replace(/의\s*/g, ' ').replace(/[\(\)\[\]\-_]/g, ' ').trim();
  if (simplified && simplified !== query) {
    try {
      let res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(simplified)}&entity=album&country=KR&limit=5`);
      let data = await res.json();
      if (data.results && data.results.length > 0) {
        const colId = data.results[0].collectionId;
        const colName = data.results[0].collectionName;
        const lookup = await fetch(`https://itunes.apple.com/lookup?id=${colId}&entity=song&country=KR`);
        const lData = await lookup.json();
        const songs = (lData.results || []).filter(item => item.wrapperType === 'track');
        if (songs.length > 0) return { albumName: colName, tracks: songs.map(s => s.trackName.trim()) };
      }
    } catch (e) {}
  }

  // 3단계: 곡 엔터티 검색을 통한 앨범 역추적 (앨범명이 곡명이나 시리즈명과 겹치는 경우)
  try {
    let res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&country=KR&limit=5`);
    let data = await res.json();
    if (data.results && data.results.length > 0) {
      const colId = data.results[0].collectionId;
      const colName = data.results[0].collectionName;
      if (colId) {
        const lookup = await fetch(`https://itunes.apple.com/lookup?id=${colId}&entity=song&country=KR`);
        const lData = await lookup.json();
        const songs = (lData.results || []).filter(item => item.wrapperType === 'track');
        if (songs.length > 0) return { albumName: colName, tracks: songs.map(s => s.trackName.trim()) };
      }
    }
  } catch (e) {}

  // 4단계: 오픈 음악 데이터베이스 (MusicBrainz) 검색
  try {
    let mbRes = await fetch(`https://musicbrainz.org/ws/2/release/?query=${encodeURIComponent(query)}&fmt=json&limit=3`);
    let mbData = await mbRes.json();
    if (mbData.releases && mbData.releases.length > 0) {
      const relId = mbData.releases[0].id;
      const relName = mbData.releases[0].title;
      let dRes = await fetch(`https://musicbrainz.org/ws/2/release/${relId}?inc=recordings&fmt=json`);
      let dData = await dRes.json();
      const list = [];
      (dData.media || []).forEach(m => {
        (m.tracks || []).forEach(tr => { if (tr.title) list.push(tr.title.trim()); });
      });
      if (list.length > 0) return { albumName: relName, tracks: list };
    }
  } catch (e) {}

  return null;
}

$('searchAlbumBtn').onclick = async () => {
  const query = $('album').value.trim();
  if (!query) {
    alert('앨범명을 입력해 주세요.');
    $('album').focus();
    return;
  }

  const btn = $('searchAlbumBtn');
  btn.disabled = true;
  btn.textContent = '곡 불러오는 중…';

  try {
    const result = await findAlbumTracks(query);
    if (!result || !result.tracks || result.tracks.length === 0) {
      throw new Error(`'${query}'에 대한 수록곡을 찾을 수 없습니다.\n\n💡 해결 팁:\n1. 조사('의')를 빼고 검색해 보세요 (예: '타요 씽씽극장' 또는 '타요')\n2. 아티스트명을 함께 넣어보세요 (예: '뽀로로 동요')\n3. 음원 사이트에서 복사한 곡 목록을 3번째 칸에 직접 붙여넣으셔도 바로 적용됩니다.`);
    }

    $('songs').value = result.tracks.join('\n');
    $('headline').value = result.albumName || query;
    
    applySongs();
    tracks.forEach((t, i) => { if (data[i]) data[i].selected = true; });
    renderTracks();
    renderEditors();
    renderOutput();
    alert(`[${result.albumName || query}] 앨범에서 ${result.tracks.length}곡을 불러왔으며, 모두 추출 체크되었습니다.`);
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '앨범 곡 불러오기';
  }
};

function renderTracks() {
  const root = $('tracklist');
  root.innerHTML = '';
  tracks.forEach((t, i) => {
    const d = document.createElement('div');
    d.className = 'track';
    d.innerHTML = `
      <span class="num" style="font-weight:750;font-size:14px">${String(i + 1).padStart(2, '0')}</span>
      <div><div class="name"></div></div>
      <label style="display:flex;align-items:center;gap:6px;margin:0;font-size:12px;font-weight:650;white-space:nowrap">
        <input type="checkbox" ${data[i].selected ? 'checked' : ''} aria-label="이 곡 추출 여부"> 추출
      </label>
    `;
    d.querySelector('.name').textContent = t.name;
    d.querySelector('input').onchange = e => {
      data[i].selected = e.target.checked;
      renderEditors();
      renderOutput();
    };
    root.appendChild(d);
  });
}

function renderEditors() {
  const root = $('candidateEditor');
  root.innerHTML = '';

  tracks.forEach((t, i) => {
    if (!data[i].selected) return;

    const wrap = document.createElement('div');
    wrap.className = 'panel';
    wrap.style.margin = '10px 0';

    const head = document.createElement('h2');
    head.textContent = `${String(i + 1).padStart(2, '0')}. ${t.name}`;
    wrap.appendChild(head);

    const kw = document.createElement('p');
    kw.className = 'hint';
    kw.textContent = '검색 키워드: ' + $('album').value.trim() + ' ' + t.name;
    wrap.appendChild(kw);

    const searchRow = document.createElement('div');
    searchRow.className = 'row';
    searchRow.style.margin = '10px 0';

    const searchBtn = document.createElement('button');
    searchBtn.className = 'btn primary';
    searchBtn.textContent = '유튜브 후보 검색';
    searchBtn.onclick = () => searchYouTube(i, searchBtn);
    searchRow.appendChild(searchBtn);

    wrap.appendChild(searchRow);

    const grid = document.createElement('div');
    grid.className = 'candidates';

    const visibleList = (data[i].candidates || []).slice(0, data[i].visibleCount || 3);

    visibleList.forEach((c, j) => {
      const card = document.createElement('div');
      card.className = 'candidate';
      card.innerHTML = `
        <img alt="후보 썸네일" src="${escapeAttr(c.image || '')}">
        <h3>${escapeAttr(c.title || '제목 없음')}</h3>
        <div class="meta">⏱️ 재생시간: ${escapeAttr(c.duration || '-')}</div>
        <div class="pick">
          <label><input type="radio" name="imagePick_${i}" data-k="imagePick" ${c.imagePick ? 'checked' : ''}> 이미지 선택</label>
          <label><input type="radio" name="audioPick_${i}" data-k="audioPick" ${c.audioPick ? 'checked' : ''}> 음원용 선택</label>
        </div>
      `;

      card.querySelectorAll('input[type=radio]').forEach(inp => {
        inp.onchange = () => {
          const key = inp.dataset.k;
          data[i].candidates.forEach(x => { x[key] = false; });
          c[key] = true;
          renderOutput();
        };
      });

      grid.appendChild(card);
    });

    wrap.appendChild(grid);

    if (data[i].allResults && data[i].allResults.length > (data[i].visibleCount || 3)) {
      const moreRow = document.createElement('div');
      moreRow.style.marginTop = '12px';
      moreRow.style.textAlign = 'center';

      const moreBtn = document.createElement('button');
      moreBtn.className = 'btn';
      moreBtn.textContent = '추가 후보 3개 더 보기';
      moreBtn.onclick = () => {
        data[i].visibleCount = (data[i].visibleCount || 3) + 3;
        syncCandidates(i);
        renderEditors();
      };
      moreRow.appendChild(moreBtn);
      wrap.appendChild(moreRow);
    }

    root.appendChild(wrap);
  });
}

function syncCandidates(i) {
  const current = data[i].candidates || [];
  const limit = data[i].visibleCount || 3;
  const list = data[i].allResults.slice(0, limit);

  data[i].candidates = list.map((item, idx) => {
    const prev = current[idx] || {};
    return {
      ...item,
      imagePick: prev.imagePick || false,
      audioPick: prev.audioPick || false
    };
  });
}

function renderOutput() {
  const selected = tracks.filter((t, i) => data[i]?.selected);
  $('count').textContent = selected.length + '곡 선택';

  const container = $('previewContainer');
  container.innerHTML = '';

  const headlineText = $('headline').value || $('album').value || '앨범';

  // 1장에 최대 8개씩 분할 (2열 4행), 8개 초과 시 다른 장으로 넘어가 헤드라인 반복
  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(selected.length / pageSize));

  for (let p = 0; p < totalPages; p++) {
    const pageItems = selected.slice(p * pageSize, (p + 1) * pageSize);

    const pageDiv = document.createElement('div');
    pageDiv.className = 'preview-page';

    // 매 장마다 헤드라인 반복
    const h2 = document.createElement('h2');
    h2.className = 'output-title';
    h2.textContent = headlineText;
    pageDiv.appendChild(h2);

    const grid = document.createElement('div');
    grid.className = 'thumbgrid';

    pageItems.forEach(t => {
      const i = t.order;
      const c = data[i].candidates.find(x => x.imagePick) || data[i].candidates[0];
      const card = document.createElement('div');
      card.className = 'thumbcard';

      if (c && c.image) {
        const img = document.createElement('img');
        img.src = c.image;
        img.alt = t.name;
        card.appendChild(img);
      } else {
        const missing = document.createElement('div');
        missing.className = 'missing';
        missing.textContent = '후보 미선택';
        card.appendChild(missing);
      }

      const cap = document.createElement('div');
      cap.className = 'caption';
      cap.textContent = t.name;
      card.appendChild(cap);

      grid.appendChild(card);
    });

    pageDiv.appendChild(grid);
    container.appendChild(pageDiv);
  }
}

async function searchYouTube(i, button) {
  const key = $('ytkey').value.trim();
  if (!key) {
    alert('YouTube Data API v3 키를 입력해 주세요.');
    $('ytkey').focus();
    return;
  }

  const track = tracks[i];
  const query = ($('album').value.trim() + ' ' + track.name).trim();
  button.disabled = true;
  button.textContent = '검색 중…';

  try {
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=15&order=relevance&q=${encodeURIComponent(query)}&key=${encodeURIComponent(key)}`;
    const sr = await fetch(searchUrl);
    const sj = await sr.json();
    if (!sr.ok) throw new Error(sj.error?.message || 'YouTube 검색 실패');

    const ids = (sj.items || []).map(x => x.id?.videoId).filter(Boolean);
    if (!ids.length) throw new Error('검색 결과가 없습니다.');

    const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${ids.join(',')}&key=${encodeURIComponent(key)}`;
    const dr = await fetch(detailsUrl);
    const dj = await dr.json();
    if (!dr.ok) throw new Error(dj.error?.message || '영상 상세 정보 획득 실패');

    const results = (dj.items || []).map(v => ({
      title: v.snippet?.title || '',
      url: `https://www.youtube.com/watch?v=${v.id}`,
      image: v.snippet?.thumbnails?.high?.url || v.snippet?.thumbnails?.medium?.url || v.snippet?.thumbnails?.default?.url || '',
      duration: secondsToDuration(isoDurationToSeconds(v.contentDetails?.duration || '')),
      seconds: isoDurationToSeconds(v.contentDetails?.duration || '')
    }));

    data[i].allResults = results;
    data[i].visibleCount = 3;
    
    data[i].candidates = results.slice(0, 3).map((r, idx) => ({
      ...r,
      imagePick: idx === 0,
      audioPick: idx === 0
    }));

    renderEditors();
    renderOutput();
  } catch (e) {
    alert('유튜브 후보 검색 오류: ' + e.message);
  } finally {
    button.disabled = false;
    button.textContent = '유튜브 후보 검색';
  }
}

function isoDurationToSeconds(iso) {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  return m ? (Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0)) : 0;
}
function secondsToDuration(sec) {
  if (!sec) return '0:00';
  const m = Math.floor(sec / 60), s = sec % 60;
  return m + ':' + String(s).padStart(2, '0');
}
function escapeAttr(s) {
  return String(s || '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
function slug(s) {
  return String(s || 'album').replace(/[\\/:*?"<>|]/g, '_').trim() || 'album';
}
function download(content, name, type) {
  const blob = new Blob([content], { type }), url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('savecsv').onclick = () => {
  const albumName = $('album').value.trim() || '앨범';
  const rows = [['앨범이름', '곡이름', '유튜브 타이틀', '유튜브 url', '재생시간']];

  tracks.forEach((t, i) => {
    if (!data[i].selected) return;
    const cs = data[i].candidates || [];
    const target = cs.find(c => c.audioPick) || cs.find(c => c.imagePick) || cs[0] || {};
    
    rows.push([
      albumName,
      t.name,
      target.title || '',
      target.url || '',
      target.duration || ''
    ]);
  });

  const csvContent = '\ufeff' + rows.map(r => r.map(v => '"' + String(v).replaceAll('"', '""') + '"').join(',')).join('\r\n');
  download(csvContent, `${slug(albumName)}_음원목록.csv`, 'text/csv;charset=utf-8');
};

$('savehtml').onclick = () => {
  const title = $('headline').value || $('album').value;
  const content = $('previewContainer').innerHTML;
  const doc = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeAttr(title)}</title>
  <style>
    body{font-family:sans-serif;max-width:1000px;margin:20px auto;color:#202124}
    .preview-page{margin-bottom:30px;page-break-after:always}
    .output-title{text-align:center;font-size:24px;margin-bottom:16px}
    .thumbgrid{display:grid;grid-template-columns:repeat(2,1fr);grid-template-rows:repeat(4,auto);gap:10px 14px}
    .thumbcard{text-align:center}
    .thumbcard img{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:8px}
    .caption{font-size:13px;font-weight:700;line-height:1.2;margin-top:3px}
  </style></head><body>${content}</body></html>`;
  download(doc, slug(title) + '.html', 'text/html;charset=utf-8');
};
$('print').onclick = () => window.print();

try {
  const savedKey = localStorage.getItem('albumToolYouTubeKey');
  if (savedKey) { $('ytkey').value = savedKey; $('rememberKey').checked = true; }
} catch (e) {}
$('rememberKey').onchange = $('ytkey').onchange = () => {
  try {
    if ($('rememberKey').checked && $('ytkey').value.trim()) localStorage.setItem('albumToolYouTubeKey', $('ytkey').value.trim());
    else if (!$('rememberKey').checked) localStorage.removeItem('albumToolYouTubeKey');
  } catch (e) {}
};

$('apply').onclick = applySongs;
$('all').onclick = () => { tracks.forEach((t, i) => data[i].selected = true); renderTracks(); renderEditors(); renderOutput(); };
$('none').onclick = () => { tracks.forEach((t, i) => data[i].selected = false); renderTracks(); renderEditors(); renderOutput(); };
$('headline').oninput = renderOutput;
$('album').onchange = renderEditors;
$('csvin').onclick = () => $('csvfile').click();
$('csvfile').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  const txt = await f.text();
  $('songs').value = txt.split(/\r?\n/).map(line => line.split(',')[0].replace(/^"|"$/g, '').trim()).filter(Boolean).join('\n');
  applySongs();
// 초기 실행 시 모든 곡 전체 체크 적용
tracks.forEach((t, i) => { if (data[i]) data[i].selected = true; });
renderTracks();
renderEditors();
renderOutput();
};

applySongs();
// 초기 실행 시 모든 곡 전체 체크 적용
tracks.forEach((t, i) => { if (data[i]) data[i].selected = true; });
renderTracks();
renderEditors();
renderOutput();
