// ============================================================
// 1. YouTube Data API v3 키 고정 설정
// 발급받으신 키를 아래 따옴표 안에 적어두시면 어떤 환경에서도 자동 적용됩니다.
// ============================================================
const FIXED_YOUTUBE_API_KEY = ""; 

const $ = id => document.getElementById(id);
let tracks = [], data = {};

// 수록곡 분리
function parseSongs() {
  return $('songs').value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}

// 곡 목록 적용 (기본: 모두 추출 체크)
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

// 2. 수록곡 목록 렌더링
function renderTracks() {
  const root = $('tracklist');
  root.innerHTML = '';
  tracks.forEach((t, i) => {
    const d = document.createElement('div');
    d.className = 'track';
    d.innerHTML = `
      <span class="num">${String(i + 1).padStart(2, '0')}</span>
      <div class="name"></div>
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

// 3. 곡별 유튜브 후보 지정 섹션
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
      
      // 국내 통신사(SKT/KT/LGU+) 차단 없는 검증된 다운로드 링크
      const mp3DownloadUrl = c.url ? `https://en.savefrom.net/1-youtube-video-downloader-78a/?url=${encodeURIComponent(c.url)}` : '';

      card.innerHTML = `
        <img alt="후보 썸네일" src="${escapeAttr(c.image || '')}">
        <h3>${escapeAttr(c.title || '제목 없음')}</h3>
        <div class="meta">⏱️ 재생시간: ${escapeAttr(c.duration || '-')}</div>
        <div class="pick">
          <label><input type="radio" name="imagePick_${i}" data-k="imagePick" ${c.imagePick ? 'checked' : ''}> 이미지 선택</label>
          <label><input type="radio" name="audioPick_${i}" data-k="audioPick" ${c.audioPick ? 'checked' : ''}> 음원 선택</label>
          ${mp3DownloadUrl ? `<a href="${mp3DownloadUrl}" target="_blank" class="btn accent" style="padding:3px 8px;font-size:11px;text-decoration:none">MP3 다운</a>` : ''}
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

// 4. 미리보기 렌더링: 모바일 A5 단독 세로뷰 & 인쇄 A4 가로 2화면 분할 완벽 대응
function renderOutput() {
  const selected = tracks.filter((t, i) => data[i]?.selected);
  $('count').textContent = selected.length + '곡 선택';

  const container = $('previewContainer');
  container.innerHTML = '';

  const headlineText = $('headline').value || $('album').value || '타요의 씽씽극장';

  // 1개 페이지(A5 크기)당 최대 8곡 (2열 4행)
  // 1장에 2페이지 = 최대 16곡
  const pageSize = 8;
  const totalPages = Math.ceil(selected.length / pageSize) || 1;
  const sheetsCount = Math.ceil(totalPages / 2);

  for (let s = 0; s < sheetsCount; s++) {
    const wrapper = document.createElement('div');
    wrapper.className = 'songbook-wrapper';

    const sheet = document.createElement('div');
    sheet.className = 'songbook-sheet';

    // 좌측 화면(페이지 1, A5) & 우측 화면(페이지 2, A5)
    for (let p = 0; p < 2; p++) {
      const pageIndex = s * 2 + p;
      if (pageIndex >= totalPages && s > 0) break;

      const pageItems = selected.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);

      const pageDiv = document.createElement('div');
      pageDiv.className = 'songbook-page';

      // 상단 헤더: 타요 버스 아이콘 + 볼드체 빨간색 로고 타이틀
      const headerDiv = document.createElement('div');
      headerDiv.className = 'page-header';
      headerDiv.innerHTML = `
        <svg class="bus-icon" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="4" y="8" width="32" height="24" rx="6" fill="#0284c7"/>
          <rect x="8" y="12" width="24" height="10" rx="3" fill="#e0f2fe"/>
          <circle cx="12" cy="17" r="2.5" fill="#0f172a"/>
          <circle cx="28" cy="17" r="2.5" fill="#0f172a"/>
          <circle cx="11" cy="31" r="3.5" fill="#334155"/>
          <circle cx="29" cy="31" r="3.5" fill="#334155"/>
          <rect x="14" y="24" width="12" height="4" rx="2" fill="#fff"/>
        </svg>
        <h2>${escapeAttr(headlineText)}</h2>
      `;
      pageDiv.appendChild(headerDiv);

      // 2열 4행 그리드
      const gridDiv = document.createElement('div');
      gridDiv.className = 'page-grid';

      pageItems.forEach(t => {
        const i = t.order;
        const c = data[i].candidates.find(x => x.imagePick) || data[i].candidates[0];
        const card = document.createElement('div');
        card.className = 'song-card';

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
        cap.className = 'song-title';
        cap.textContent = t.name;
        card.appendChild(cap);

        gridDiv.appendChild(card);
      });

      pageDiv.appendChild(gridDiv);
      sheet.appendChild(pageDiv);
    }

    wrapper.appendChild(sheet);
    container.appendChild(wrapper);
  }
}

// 유튜브 Data API v3 검색
async function searchYouTube(i, button) {
  const key = getApiKey();
  if (!key) {
    alert('YouTube Data API v3 키를 입력해 주세요.\n한 번 입력하시면 다음부터는 자동 고정됩니다.');
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

// API 키 고정 및 불러오기 함수
function getApiKey() {
  if (FIXED_YOUTUBE_API_KEY && FIXED_YOUTUBE_API_KEY.trim()) {
    return FIXED_YOUTUBE_API_KEY.trim();
  }
  const inputVal = $('ytkey')?.value.trim();
  if (inputVal) return inputVal;
  return localStorage.getItem('albumToolYouTubeKey') || '';
}

// 미리보기 HTML 저장 (no-referrer 메타로 이미지 영구 보호)
$('savePreviewHtml').onclick = () => {
  const title = $('headline').value || $('album').value || '타요의 씽씽극장';
  const previewHtml = $('previewContainer').innerHTML;

  const doc = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="referrer" content="no-referrer">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeAttr(title)} - 송북</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;margin:16px;background:#f8fafc;color:#1e293b}
.songbook-wrapper{background:#fff;border:2px solid #334155;border-radius:8px;padding:14px;margin-bottom:24px;page-break-after:always}
.songbook-sheet{display:grid;grid-template-columns:1fr 1fr;position:relative;gap:16px}
.songbook-sheet::before{content:'';position:absolute;left:50%;top:0;bottom:0;width:1px;border-left:1.5px dashed #94a3b8;transform:translateX(-50%)}
.songbook-page{border:1.5px dashed #94a3b8;border-radius:12px;padding:12px;background:#fff;display:flex;flex-direction:column}
.page-header{display:flex;align-items:center;gap:8px;padding-bottom:8px;margin-bottom:10px;border-bottom:1.5px dashed #cbd5e1}
.page-header .bus-icon{width:30px;height:30px}
.page-header h2{margin:0;font-size:20px;font-weight:900;color:#ef4444}
.page-grid{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(4, minmax(0, 1fr));gap:8px 6px}
.song-card{border:1px dashed #cbd5e1;border-radius:8px;padding:4px;display:flex;flex-direction:column;align-items:center;text-align:center}
.song-card img{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:6px;display:block}
.song-card .song-title{font-size:11px;font-weight:700;line-height:1.2;margin-top:3px;color:#1e293b}
@media (max-width: 768px) {
  .songbook-sheet{grid-template-columns:1fr;gap:20px}
  .songbook-sheet::before{display:none}
  .songbook-page{max-width:440px;margin:0 auto;box-shadow:0 4px 16px rgba(0,0,0,0.06)}
}
@media print{
  @page{size:A4 landscape;margin:5mm}
  body{margin:0;background:white}
  .songbook-wrapper{border:2px solid #000!important;padding:5mm!important;margin:0 0 10mm 0!important}
  .songbook-sheet{display:grid!important;grid-template-columns:1fr 1fr!important;gap:6mm!important}
  .songbook-sheet::before{display:block!important;border-left:1.5px dashed #94a3b8!important}
  .songbook-page{max-width:none!important;margin:0!important;box-shadow:none!important}
  .page-header h2{color:#ef4444!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .song-card img{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
</style>
</head>
<body>
${previewHtml}
</body>
</html>`;

  download(doc, `${slug(title)}_송북_A5_A4가로.html`, 'text/html;charset=utf-8');
};

// 작업 백업 HTML 저장
$('saveBackupHtml').onclick = () => {
  const title = $('headline').value || $('album').value || '타요의 씽씽극장';
  const stateData = { album: $('album').value, headline: $('headline').value, songs: $('songs').value, tracks, data };
  const backupDoc = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeAttr(title)} - 백업</title></head><body><h1>${escapeAttr(title)} 작업 상태 백업</h1><pre>${escapeAttr(JSON.stringify(stateData, null, 2))}</pre></body></html>`;
  download(backupDoc, `${slug(title)}_작업백업.html`, 'text/html;charset=utf-8');
};

// 음원 MP3 다운로드 모달 창 (진짜 MP3 다운로드 링크 연결)
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
    
    // 국내 통신사 DNS 차단 없는 글로벌 다운로더 3가지 채널 제공
    const savefromUrl = c?.url ? `https://en.savefrom.net/1-youtube-video-downloader-78a/?url=${encodeURIComponent(c.url)}` : '';
    const yt1sUrl = c?.url ? `https://yt1s.com/en/youtube-to-mp3?q=${encodeURIComponent(c.url)}` : '';
    const loaderUrl = c?.url ? `https://loader.to/api/button/?url=${encodeURIComponent(c.url)}&f=mp3` : '';

    row.innerHTML = `
      <div>
        <strong style="font-size:13px">${escapeAttr(t.name)}</strong>
        <div style="font-size:11px;color:var(--muted)">${escapeAttr(c?.title || '후보 미선택')}</div>
      </div>
      <div class="mp3-btn-group" style="display:flex;gap:4px">
        ${c?.url ? `
          <a href="${savefromUrl}" target="_blank" class="btn accent" style="font-size:11px;text-decoration:none;padding:4px 8px">다운로드 1</a>
          <a href="${yt1sUrl}" target="_blank" class="btn" style="font-size:11px;text-decoration:none;padding:4px 8px">다운로드 2</a>
          <a href="${loaderUrl}" target="_blank" class="btn" style="font-size:11px;text-decoration:none;padding:4px 8px">다운로드 3</a>
        ` : '<span style="font-size:11px;color:var(--muted)">URL 없음</span>'}
      </div>
    `;
    list.appendChild(row);
  });

  modal.style.display = 'flex';
};

// URL 텍스트 다운로드
$('downloadUrlTxt').onclick = () => {
  const lines = [];
  tracks.forEach(t => {
    if (!data[t.order]?.selected) return;
    const c = (data[t.order].candidates || []).find(x => x.audioPick) || (data[t.order].candidates || [])[0];
    if (c?.url) lines.push(`${t.name}: ${c.url}`);
  });
  download(lines.join('\r\n'), `${slug($('album').value)}_음원링크.txt`, 'text/plain;charset=utf-8');
};

// Python 자동 일괄 다운로더 스크립트 생성
$('downloadPyScript').onclick = () => {
  const albumName = $('album').value.trim() || '타요의 씽씽극장';
  const urls = [];
  tracks.forEach(t => {
    if (!data[t.order]?.selected) return;
    const c = (data[t.order].candidates || []).find(x => x.audioPick) || (data[t.order].candidates || [])[0];
    if (c?.url) urls.push({ name: t.name, url: c.url });
  });

  if (!urls.length) { alert('선택된 음원 URL이 없습니다.'); return; }

  const pyCode = `# -*- coding: utf-8 -*-
# ${albumName} 전곡 자동 MP3 다운로더
import os, subprocess, sys

try:
    import yt_dlp
except ImportError:
    print("yt-dlp 설치 중...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "yt-dlp"])

tracks = ${JSON.stringify(urls, null, 2)}
folder = "${slug(albumName)}_MP3"
os.makedirs(folder, exist_ok=True)

for i, t in enumerate(tracks, 1):
    print(f"[{i}/{len(tracks)}] {t['name']} 다운로드 중...")
    cmd = [
        sys.executable, "-m", "yt_dlp",
        "-x", "--audio-format", "mp3", "--audio-quality", "0",
        "-o", os.path.join(folder, f"{i:02d}_{t['name']}.%(ext)s"),
        t["url"]
    ]
    subprocess.run(cmd)

print(f"\n모든 곡이 '{folder}' 폴더에 성공적으로 저장되었습니다!")
`;
  download(pyCode, `${slug(albumName)}_전곡다운로더.py`, 'text/x-python;charset=utf-8');
};

// PC 일괄 다운로드 배치파일(.bat)
$('downloadBatScript').onclick = () => {
  const albumName = $('album').value.trim() || '타요의 씽씽극장';
  const urls = [];
  tracks.forEach(t => {
    if (!data[t.order]?.selected) return;
    const c = (data[t.order].candidates || []).find(x => x.audioPick) || (data[t.order].candidates || [])[0];
    if (c?.url) urls.push(`yt-dlp -x --audio-format mp3 -o "${albumName}/%(title)s.%(ext)s" "${c.url}"`);
  });

  if (!urls.length) { alert('다운로드할 음원 후보가 없습니다.'); return; }
  const batContent = `@echo off\r\nchcp 65001 > nul\r\necho [${albumName}] MP3 일괄 다운로드를 진행합니다...\r\n` + urls.join('\r\n') + '\r\npause';
  download(batContent, `${slug(albumName)}_일괄다운로드.bat`, 'text/plain;charset=utf-8');
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

// API 키 로컬 보존
try {
  const savedKey = localStorage.getItem('albumToolYouTubeKey');
  if (savedKey) $('ytkey').value = savedKey;
} catch (e) {}
$('ytkey').onchange = () => {
  try {
    const val = $('ytkey').value.trim();
    if (val) localStorage.setItem('albumToolYouTubeKey', val);
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

// 시작 시 즉시 15곡 적용
applySongs();
tracks.forEach((t, i) => { if (data[i]) data[i].selected = true; });
renderTracks();
renderEditors();
renderOutput();
