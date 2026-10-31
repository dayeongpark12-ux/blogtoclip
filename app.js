// ============================================================
// 1. YouTube Data API v3 키 고정 설정
// ============================================================
const FIXED_YOUTUBE_API_KEY = ""; 

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
      const mp3DownloadUrl = c.url ? `https://en.savefrom.net/1-youtube-video-downloader-78a/?url=${encodeURIComponent(c.url)}` : '';

      card.innerHTML = `
        <div class="thumb-box"><img alt="후보 썸네일" src="${escapeAttr(c.image || '')}"></div>
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

// 4. 미리보기 렌더링: 1번 사진 완벽 일치 (중앙 정렬, 자동차 아이콘 삭제, 테두리 삭제, 검정 띠 크롭)
function renderOutput() {
  const selected = tracks.filter((t, i) => data[i]?.selected);
  $('count').textContent = selected.length + '곡 선택';

  const container = $('previewContainer');
  container.innerHTML = '';

  const headlineText = $('headline').value || $('album').value || '타요의 씽씽극장';

  const pageSize = 8;
  const totalSongbooks = Math.ceil(selected.length / pageSize) || 1;

  for (let s = 0; s < totalSongbooks; s++) {
    const pageItems = selected.slice(s * pageSize, (s + 1) * pageSize);

    const songbookCard = document.createElement('div');
    songbookCard.className = 'single-songbook';
    songbookCard.dataset.songbookIndex = s + 1;

    // 헤드라인 중앙 정렬 & 자동차 그림 삭제
    const headerDiv = document.createElement('div');
    headerDiv.className = 'songbook-header';
    headerDiv.innerHTML = `<h2>${escapeAttr(headlineText)}</h2>`;
    songbookCard.appendChild(headerDiv);

    // 2열 4행 그리드
    const gridDiv = document.createElement('div');
    gridDiv.className = 'songbook-grid';

    pageItems.forEach(t => {
      const i = t.order;
      const c = data[i].candidates.find(x => x.imagePick) || data[i].candidates[0];
      const item = document.createElement('div');
      item.className = 'song-item'; // 개별 카드 테두리 삭제됨

      if (c && c.image) {
        // 검정 띠를 잘라내는 thumb-crop 래퍼 적용
        const cropDiv = document.createElement('div');
        cropDiv.className = 'thumb-crop';
        const img = document.createElement('img');
        img.crossOrigin = 'anonymous';
        img.src = c.image;
        img.alt = t.name;
        cropDiv.appendChild(img);
        item.appendChild(cropDiv);
      } else {
        const cropDiv = document.createElement('div');
        cropDiv.className = 'thumb-crop';
        const missing = document.createElement('div');
        missing.className = 'missing';
        missing.textContent = '후보 미선택';
        cropDiv.appendChild(missing);
        item.appendChild(cropDiv);
      }

      const cap = document.createElement('div');
      cap.className = 'song-title';
      cap.textContent = t.name;
      item.appendChild(cap);

      gridDiv.appendChild(item);
    });

    songbookCard.appendChild(gridDiv);

    // 송북 개별 저장 액션
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'songbook-actions no-print';
    actionsDiv.innerHTML = `
      <span style="font-size:11px;color:var(--muted);margin-right:auto;align-self:center">송북 ${s + 1} (${pageItems.length}곡)</span>
      <button class="btn" onclick="exportSingleSongbook(${s}, 'image')">이 송북 이미지 저장</button>
      <button class="btn success" onclick="exportSingleSongbook(${s}, 'pdf')">이 송북 PDF 저장</button>
    `;
    songbookCard.appendChild(actionsDiv);

    container.appendChild(songbookCard);
  }
}

async function renderSongbookToCanvas(songbookElement) {
  const actions = songbookElement.querySelector('.songbook-actions');
  if (actions) actions.style.display = 'none';

  try {
    const canvas = await html2canvas(songbookElement, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff'
    });
    return canvas;
  } finally {
    if (actions) actions.style.display = 'flex';
  }
}

window.exportSingleSongbook = async function(index, format) {
  const songbooks = document.querySelectorAll('.single-songbook');
  const target = songbooks[index];
  if (!target) return;

  const title = $('headline').value || $('album').value || '타요_송북';

  if (typeof html2canvas === 'undefined') {
    alert('PDF/이미지 라이브러리를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.');
    return;
  }

  const canvas = await renderSongbookToCanvas(target);

  if (format === 'image') {
    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slug(title)}_송북_${index + 1}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  } else if (format === 'pdf') {
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) {
      window.print();
      return;
    }
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' });
    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    pdf.addImage(imgData, 'JPEG', 5, 5, 138, (canvas.height * 138) / canvas.width);
    pdf.save(`${slug(title)}_송북_${index + 1}.pdf`);
  }
};

$('downloadAllPdfBtn').onclick = async () => {
  const songbooks = document.querySelectorAll('.single-songbook');
  if (!songbooks.length) { alert('선택된 곡이 없습니다.'); return; }

  const btn = $('downloadAllPdfBtn');
  btn.disabled = true;
  btn.textContent = 'PDF 생성 중…';

  try {
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF || typeof html2canvas === 'undefined') {
      window.print();
      return;
    }

    const title = $('headline').value || $('album').value || '타요_송북';
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' });

    for (let i = 0; i < songbooks.length; i++) {
      if (i > 0) pdf.addPage('a5', 'portrait');
      const canvas = await renderSongbookToCanvas(songbooks[i]);
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      pdf.addImage(imgData, 'JPEG', 5, 5, 138, (canvas.height * 138) / canvas.width);
    }

    pdf.save(`${slug(title)}_전체송북.pdf`);
  } catch (err) {
    alert('PDF 직접 저장 실패: 인쇄 창으로 전환합니다. (' + err.message + ')');
    window.print();
  } finally {
    btn.disabled = false;
    btn.textContent = '📄 전체 송북 PDF 다운로드';
  }
};

$('downloadAllImgBtn').onclick = async () => {
  const songbooks = document.querySelectorAll('.single-songbook');
  if (!songbooks.length) { alert('선택된 곡이 없습니다.'); return; }

  const btn = $('downloadAllImgBtn');
  btn.disabled = true;
  btn.textContent = '이미지 생성 중…';

  try {
    const title = $('headline').value || $('album').value || '타요_송북';
    for (let i = 0; i < songbooks.length; i++) {
      const canvas = await renderSongbookToCanvas(songbooks[i]);
      canvas.toBlob(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${slug(title)}_송북_${i + 1}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }, 'image/png');
      await new Promise(r => setTimeout(r, 400));
    }
  } finally {
    btn.disabled = false;
    btn.textContent = '🖼️ 전체 송북 이미지(PNG) 저장';
  }
};

async function searchYouTube(i, button) {
  const key = getApiKey();
  if (!key) {
    alert('YouTube Data API v3 키를 입력해 주세요.\n한 번 입력하시면 자동 고정됩니다.');
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

function getApiKey() {
  if (FIXED_YOUTUBE_API_KEY && FIXED_YOUTUBE_API_KEY.trim()) return FIXED_YOUTUBE_API_KEY.trim();
  const inputVal = $('ytkey')?.value.trim();
  if (inputVal) return inputVal;
  return localStorage.getItem('albumToolYouTubeKey') || '';
}

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
body{font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;margin:16px;background:#f8fafc;color:#1e293b;display:flex;flex-direction:column;align-items:center;gap:20px}
.single-songbook{border:2px dashed #94a3b8;border-radius:14px;padding:16px 14px 18px;background:#fff;width:100%;max-width:440px;display:flex;flex-direction:column;box-shadow:0 4px 16px rgba(0,0,0,0.06)}
.songbook-header{display:flex;justify-content:center;align-items:center;padding-bottom:10px;margin-bottom:14px;border-bottom:2px dashed #cbd5e1;text-align:center}
.songbook-header h2{margin:0;font-size:24px;font-weight:900;color:#ef4444;text-align:center}
.songbook-grid{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(4, minmax(0, 1fr));gap:12px 10px}
.song-item{border:none;padding:0;background:transparent;display:flex;flex-direction:column;align-items:center;text-align:center}
.thumb-crop{width:100%;aspect-ratio:16/9;overflow:hidden;border-radius:8px;background:#f1f5f9}
.thumb-crop img{width:100%;height:100%;object-fit:cover;transform:scale(1.18);display:block}
.song-item .song-title{font-size:12px;font-weight:700;line-height:1.2;margin-top:5px;color:#1e293b;text-align:center}
.songbook-actions{display:none}
@media print{
  @page{size:A4 portrait;margin:8mm}
  body{background:white;margin:0}
  .single-songbook{page-break-after:always;border:2px dashed #000!important;max-width:none!important;margin:0 0 12mm 0;box-shadow:none!important}
  .songbook-header h2{color:#ef4444!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .thumb-crop img{-webkit-print-color-adjust:exact;print-color-adjust:exact;transform:scale(1.18)!important}
}
</style>
</head>
<body>
${previewHtml}
</body>
</html>`;

  download(doc, `${slug(title)}_송북.html`, 'text/html;charset=utf-8');
};

$('downloadMp3Btn').onclick = () => {
  const modal = $('mp3Modal');
  const list = $('mp3List');
  list.innerHTML = '';

  const selectedTracks = tracks.filter((t, i) => data[i]?.selected);
  if (!selectedTracks.length) { alert('선택된 곡이 없습니다.'); return; }

  selectedTracks.forEach(t => {
    const c = (data[t.order].candidates || []).find(x => x.audioPick) || (data[t.order].candidates || [])[0];
    const row = document.createElement('div');
    row.className = 'mp3-item';
    
    const savefromUrl = c?.url ? `https://en.savefrom.net/1-youtube-video-downloader-78a/?url=${encodeURIComponent(c.url)}` : '';
    const yt1sUrl = c?.url ? `https://yt1s.com/en/youtube-to-mp3?q=${encodeURIComponent(c.url)}` : '';
    const loaderUrl = c?.url ? `https://loader.to/api/button/?url=${encodeURIComponent(c.url)}&f=mp3` : '';

    row.innerHTML = `
      <div>
        <strong style="font-size:13px">${escapeAttr(t.name)}</strong>
        <div style="font-size:11px;color:var(--muted)">${escapeAttr(c?.title || '후보 미선택')}</div>
      </div>
      <div class="mp3-btn-group">
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

$('downloadUrlTxt').onclick = () => {
  const lines = [];
  tracks.forEach(t => {
    if (!data[t.order]?.selected) return;
    const c = (data[t.order].candidates || []).find(x => x.audioPick) || (data[t.order].candidates || [])[0];
    if (c?.url) lines.push(`${t.name}: ${c.url}`);
  });
  download(lines.join('\r\n'), `${slug($('album').value)}_음원링크.txt`, 'text/plain;charset=utf-8');
};

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

$('print').onclick = () => window.print();

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

applySongs();
tracks.forEach((t, i) => { if (data[i]) data[i].selected = true; });
renderTracks();
renderEditors();
renderOutput();
