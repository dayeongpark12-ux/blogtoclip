const $ = id => document.getElementById(id);
let tracks = [], data = {};

function parseSongs() {
  return $('songs').value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}

// 곡 목록 적용 (추출 체크박스는 기본 무조건 true)
function applySongs() {
  const oldByName = {};
  tracks.forEach((t, i) => { oldByName[t.name] = data[i]; });
  
  tracks = parseSongs().map((name, i) => ({ name, order: i }));
  data = {};

  tracks.forEach((t, i) => {
    const existing = oldByName[t.name];
    data[i] = {
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

// 앨범 수록곡 자동 검색 (4단계 완화 검색 엔진)
async function findAlbumTracks(query) {
  try {
    let res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=album&country=KR&limit=5`);
    let d = await res.json();
    if (d.results && d.results.length > 0) {
      const colId = d.results[0].collectionId, colName = d.results[0].collectionName;
      const lookup = await fetch(`https://itunes.apple.com/lookup?id=${colId}&entity=song&country=KR`);
      const ld = await lookup.json();
      const songs = (ld.results || []).filter(item => item.wrapperType === 'track');
      if (songs.length > 0) return { albumName: colName, tracks: songs.map(s => s.trackName.trim()) };
    }
  } catch (e) {}

  const simplified = query.replace(/의\s*/g, ' ').replace(/[\(\)\[\]\-_]/g, ' ').trim();
  if (simplified && simplified !== query) {
    try {
      let res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(simplified)}&entity=album&country=KR&limit=5`);
      let d = await res.json();
      if (d.results && d.results.length > 0) {
        const colId = d.results[0].collectionId, colName = d.results[0].collectionName;
        const lookup = await fetch(`https://itunes.apple.com/lookup?id=${colId}&entity=song&country=KR`);
        const ld = await lookup.json();
        const songs = (ld.results || []).filter(item => item.wrapperType === 'track');
        if (songs.length > 0) return { albumName: colName, tracks: songs.map(s => s.trackName.trim()) };
      }
    } catch (e) {}
  }

  try {
    let res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&country=KR&limit=5`);
    let d = await res.json();
    if (d.results && d.results.length > 0 && d.results[0].collectionId) {
      const lookup = await fetch(`https://itunes.apple.com/lookup?id=${d.results[0].collectionId}&entity=song&country=KR`);
      const ld = await lookup.json();
      const songs = (ld.results || []).filter(item => item.wrapperType === 'track');
      if (songs.length > 0) return { albumName: d.results[0].collectionName, tracks: songs.map(s => s.trackName.trim()) };
    }
  } catch (e) {}

  try {
    let mbRes = await fetch(`https://musicbrainz.org/ws/2/release/?query=${encodeURIComponent(query)}&fmt=json&limit=3`);
    let mbData = await mbRes.json();
    if (mbData.releases && mbData.releases.length > 0) {
      const relId = mbData.releases[0].id, relName = mbData.releases[0].title;
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
  if (!query) { alert('앨범명을 입력해 주세요.'); $('album').focus(); return; }

  const btn = $('searchAlbumBtn');
  btn.disabled = true;
  btn.textContent = '곡 불러오는 중…';

  try {
    const result = await findAlbumTracks(query);
    if (!result || !result.tracks || result.tracks.length === 0) {
      throw new Error(`'${query}' 앨범을 찾지 못했습니다.\n조사('의')를 빼거나 가수명을 함께 입력해 보세요.`);
    }

    $('songs').value = result.tracks.join('\n');
    $('headline').value = result.albumName || query;
    
    applySongs();
    tracks.forEach((t, i) => { if (data[i]) data[i].selected = true; });
    renderTracks();
    renderEditors();
    renderOutput();
    alert(`[${result.albumName || query}]에서 ${result.tracks.length}곡을 불러왔으며, 모두 선택되었습니다.`);
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '앨범 곡 불러오기';
  }
};

// 2. 수록곡 목록 렌더링 ('앨범 수록곡 00번째' 문구 없음)
function renderTracks() {
  const root = $('tracklist');
  root.innerHTML = '';
  tracks.forEach((t, i) => {
    const d = document.createElement('div');
    d.className = 'track';
    d.innerHTML = `
      <span class="num" style="font-weight:750;font-size:14px">${String(i + 1).padStart(2, '0')}</span>
      <div><div class="name"></div></div>
      <label style="display:flex;align-items:center;gap:6px;margin:0;font-size:12px;font-weight:650;white-space:nowrap;cursor:pointer">
        <input type="checkbox" ${data[i].selected ? 'checked' : ''} aria-label="추출 여부"> 추출
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

// 3. 곡별 유튜브 후보 지정 섹션 (썸네일 확대, URL 입력창 삭제, MP3 버튼)
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

    const searchRow = document.createElement('div');
    searchRow.className = 'row';
    searchRow.style.margin = '8px 0 12px';

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
          <label><input type="radio" name="audioPick_${i}" data-k="audioPick" ${c.audioPick ? 'checked' : ''}> 음원 선택</label>
          ${c.url ? `<a href="https://www.y2mate.com/youtube/${c.id}" target="_blank" class="btn" style="padding:4px 8px;font-size:11px;text-decoration:none">MP3 다운</a>` : ''}
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

// 4. 미리보기 렌더링 (A4 1장에 최대 2세트 수용, 헤드라인당 8개 2열 4행)
function renderOutput() {
  const selected = tracks.filter((t, i) => data[i]?.selected);
  $('count').textContent = selected.length + '곡 선택';

  const container = $('previewContainer');
  container.innerHTML = '';

  const headlineText = $('headline').value || $('album').value || '앨범';

  // 1세트당 최대 8개
  const setSize = 8;
  const totalSets = Math.ceil(selected.length / setSize) || 1;

  // A4 한 장당 2세트씩 묶기
  for (let pageIdx = 0; pageIdx < Math.ceil(totalSets / 2); pageIdx++) {
    const pageDiv = document.createElement('div');
    pageDiv.className = 'preview-page';

    // 해당 페이지에 들어갈 2개 세트 생성 (Set 1, Set 2)
    for (let s = 0; s < 2; s++) {
      const currentSetIdx = pageIdx * 2 + s;
      if (currentSetIdx >= totalSets && pageIdx > 0) break;

      const setDiv = document.createElement('div');
      setDiv.className = 'preview-set';

      const h2 = document.createElement('h2');
      h2.className = 'output-title';
      h2.textContent = headlineText + (totalSets > 1 ? ` (${currentSetIdx + 1})` : '');
      setDiv.appendChild(h2);

      const grid = document.createElement('div');
      grid.className = 'thumbgrid';

      const setItems = selected.slice(currentSetIdx * setSize, (currentSetIdx + 1) * setSize);

      setItems.forEach(t => {
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

      setDiv.appendChild(grid);
      pageDiv.appendChild(setDiv);
    }

    container.appendChild(pageDiv);
  }
}

// 유튜브 Data API v3 검색
async function searchYouTube(i, button) {
  const key = $('ytkey').value.trim();
  if (!key) { alert('YouTube Data API v3 키를 입력해 주세요.'); $('ytkey').focus(); return; }

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
    if (!dr.ok) throw new Error(dj.error?.message || '상세 정보 획득 실패');

    const results = (dj.items || []).map(v => ({
      id: v.id,
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

// 5. 미리보기 HTML 저장 (이미지 깨짐 방지 no-referrer 적용)
$('savePreviewHtml').onclick = () => {
  const title = $('headline').value || $('album').value || '앨범';
  const previewHtml = $('previewContainer').innerHTML;

  const doc = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="referrer" content="no-referrer">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeAttr(title)}</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;margin:20px;background:#f8f9fa;color:#202124}
.preview-page{background:white;padding:24px;border-radius:14px;box-shadow:0 2px 12px rgba(0,0,0,0.06);margin-bottom:28px;display:grid;grid-template-columns:repeat(2, minmax(0, 1fr));gap:24px;page-break-after:always}
.preview-set{border:1px solid #eee;border-radius:10px;padding:14px;background:#fff}
.output-title{text-align:center;font-size:22px;font-weight:800;letter-spacing:-.03em;margin:0 0 20px 0;padding-bottom:8px;border-bottom:2px solid #e5e7eb}
.thumbgrid{display:grid;grid-template-columns:repeat(2, 1fr);gap:8px 12px}
.thumbcard{text-align:center}
.thumbcard img{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:8px;display:block}
.caption{font-size:12px;font-weight:700;line-height:1.2;margin-top:2px}
@media print{
  @page{size:A4 landscape;margin:6mm}
  body{margin:0;background:white}
  .preview-page{box-shadow:none;padding:0;margin:0 0 10mm 0;border:0}
  .preview-set{border:0;padding:0}
  .output-title{font-size:16pt;margin:0 0 14px 0}
  .caption{font-size:10pt}
}
</style>
</head>
<body>
${previewHtml}
</body>
</html>`;

  download(doc, `${slug(title)}_미리보기.html`, 'text/html;charset=utf-8');
};

// 6. 입력값(앨범명, 후보 등)을 포함한 전체 HTML 백업 저장
$('saveBackupHtml').onclick = () => {
  const title = $('headline').value || $('album').value || '앨범';
  const stateData = {
    album: $('album').value,
    headline: $('headline').value,
    songs: $('songs').value,
    tracks,
    data
  };

  const backupDoc = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="referrer" content="no-referrer">
<title>${escapeAttr(title)} - 작업 백업</title>
</head>
<body>
<h1>${escapeAttr(title)} 작업 상태 백업 파일</h1>
<p>이 파일은 작업 상태를 보존한 HTML 백업본입니다.</p>
<pre id="backupData" style="background:#eee;padding:16px;border-radius:8px;overflow:auto">${escapeAttr(JSON.stringify(stateData, null, 2))}</pre>
<h2>미리보기</h2>
${$('previewContainer').innerHTML}
</body>
</html>`;

  download(backupDoc, `${slug(title)}_작업백업.html`, 'text/html;charset=utf-8');
};

// 7. 선택 음원 MP3 다운로드 모달 및 스크립트 생성
$('downloadMp3Btn').onclick = () => {
  const modal = $('mp3Modal');
  const list = $('mp3List');
  list.innerHTML = '';

  const selectedTracks = tracks.filter((t, i) => data[i]?.selected);
  if (!selectedTracks.length) {
    alert('선택된 곡이 없습니다.');
    return;
  }

  selectedTracks.forEach(t => {
    const c = (data[t.order].candidates || []).find(x => x.audioPick) || (data[t.order].candidates || [])[0];
    const row = document.createElement('div');
    row.className = 'mp3-item';
    row.innerHTML = `
      <div>
        <strong style="font-size:13px">${escapeAttr(t.name)}</strong>
        <div style="font-size:11px;color:var(--muted)">${escapeAttr(c?.title || '후보 영상 미선택')}</div>
      </div>
      <div>
        ${c?.id ? `<a href="https://www.y2mate.com/youtube/${c.id}" target="_blank" class="btn primary" style="font-size:12px;text-decoration:none;padding:6px 10px">MP3 변환/저장</a>` : '<span style="font-size:11px;color:var(--muted)">URL 없음</span>'}
      </div>
    `;
    list.appendChild(row);
  });

  modal.style.display = 'flex';
};

// yt-dlp 일괄 다운로드 배치파일(.bat) 다운로드
$('downloadBatScript').onclick = () => {
  const albumName = $('album').value.trim() || '앨범';
  const urls = [];
  tracks.forEach(t => {
    if (!data[t.order]?.selected) return;
    const c = (data[t.order].candidates || []).find(x => x.audioPick) || (data[t.order].candidates || [])[0];
    if (c?.url) urls.push(`yt-dlp -x --audio-format mp3 -o "${albumName}/%(title)s.%(ext)s" "${c.url}"`);
  });

  if (!urls.length) { alert('다운로드할 음원 URL이 없습니다.'); return; }
  const batContent = `@echo off\r\nchcp 65001 > nul\r\necho [${albumName}] MP3 다운로드를 시작합니다...\r\n` + urls.join('\r\n') + '\r\npause';
  download(batContent, `${slug(albumName)}_MP3_일괄다운로드.bat`, 'text/plain;charset=utf-8');
};

// 인쇄 / PDF 저장
$('print').onclick = () => window.print();

// CSV 저장
$('savecsv').onclick = () => {
  const albumName = $('album').value.trim() || '앨범';
  const rows = [['앨범이름', '곡이름', '유튜브 타이틀', '유튜브 url', '재생시간']];

  tracks.forEach((t, i) => {
    if (!data[i].selected) return;
    const cs = data[i].candidates || [];
    const target = cs.find(c => c.audioPick) || cs.find(c => c.imagePick) || cs[0] || {};
    rows.push([albumName, t.name, target.title || '', target.url || '', target.duration || '']);
  });

  const csvContent = '\ufeff' + rows.map(r => r.map(v => '"' + String(v).replaceAll('"', '""') + '"').join(',')).join('\r\n');
  download(csvContent, `${slug(albumName)}_음원목록.csv`, 'text/csv;charset=utf-8');
};

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
  tracks.forEach((t, i) => { if (data[i]) data[i].selected = true; });
  renderTracks();
  renderEditors();
  renderOutput();
};

applySongs();
tracks.forEach((t, i) => { if (data[i]) data[i].selected = true; });
renderTracks();
renderEditors();
renderOutput();
