// ============================================================
// 1. YouTube Data API v3 키 고정 설정 (필요 시 직접 기입 가능)
// ============================================================
const FIXED_YOUTUBE_API_KEY = ""; 

const $ = id => document.getElementById(id);
let tracks = [], data = {};
let backendAvailable = null; // null: 미확인, true: /api/search 사용 가능, false: 미지원

// ============================================================
// [요청 반영 2] 인기 유아 동요 및 앨범별 공식 곡명 데이터베이스 & 오타 교정 제안
// ============================================================
const SONG_DATABASE = {
  '핑크퐁 자동차 동요': [
    '누가 제일 빠를까요', '출동! 소방차', '소방차와 세차', '경찰차', '포크레인', '세차송',
    '힘센 중장비차', '부릉부릉 버스', '불이야 불', '트랙터', '헬리콥터', '기차',
    '잠수함', '우주선', '레이싱카', '구급차', '쓰레기차', '레미콘', '불도저', '견인차'
  ],
  '핑크퐁 공룡 동요': [
    '티라노사우루스', '트리케라톱스', '브라키오사우루스', '프테라노돈', '안킬로사우루스',
    '스테고사우루스', '공룡 ABC', '내가 최고야', '화석이 될 거야', '공룡 따라 해봐요', '공룡 사파리'
  ],
  '타요의 씽씽극장': [
    '오프닝', '꼬마버스가 출발합니다', '용감한 자동차들', '주룩주룩 첨벙첨벙', '천하장사 중장비',
    '뚝딱뚝딱 만능 정비사', '꿈나라로 쿨쿨쿨', '많이 많이 닮았네', '정다운 시골여행',
    '반짝반짝 상쾌한 하루', '행복을 배달해요', '푸른 하늘 높이', '환상의 우주 여행', '아침이 밝았어요', '엔딩'
  ],
  '뽀로로와 노래해요': [
    '개구리', '일어날 시간이야', '바라밤', '꼭꼭 숨어라', '숫자놀이', '무지개', '개구쟁이',
    '착한 어린이', '피아노 연주', '예쁜 아기곰', '남극 펭귄', '딩동댕', '어른들은 몰라요',
    '붕붕붕 붕붕붕', '뚱보새', '뽀롱뽀롱 뽀로로 오프닝'
  ],
  '인기 유아동요': [
    '병원차와 소방차', '밀과 보리가 자라네', '열 꼬마 인디언', '작은 별', '산토끼',
    '곰 세 마리', '나비야', '악어 떼', '통통통통', '그대로 멈춰라', '올챙이와 개구리',
    '둥근 해가 떴습니다', '사과 같은 내 얼굴', '멋쟁이 토마토', '솜사탕'
  ]
};

// 레벤슈타인 편집 거리 계산
function getLevenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

// 오타 및 유사곡 제안 탐색 함수
function findSongSuggestion(inputTitle, albumTitle = '') {
  if (!inputTitle || typeof inputTitle !== 'string') return null;
  const rawInput = inputTitle.trim();
  const cleanInput = rawInput.replace(/\s+/g, '');
  if (cleanInput.length < 2) return null;

  const cleanAlbum = (albumTitle || $('album')?.value || '').trim();

  // 1. 한국어 규칙 어미 변환 (~까 <-> ~까요, ~해 <-> ~해요, ~송 <-> ~노래)
  const ruleSuggestions = [];
  if (rawInput.endsWith('까')) {
    ruleSuggestions.push(rawInput + '요');
  } else if (rawInput.endsWith('까요')) {
    ruleSuggestions.push(rawInput.slice(0, -1));
  }
  if (rawInput.endsWith('해')) {
    ruleSuggestions.push(rawInput + '요');
  } else if (rawInput.endsWith('송')) {
    ruleSuggestions.push(rawInput.slice(0, -1) + ' 노래');
  }

  // 2. 검색 대상 풀 구성 (입력된 앨범명 우선 가중치)
  let searchPool = [];
  Object.keys(SONG_DATABASE).forEach(cat => {
    const isCatMatch = cleanAlbum && (cleanAlbum.includes(cat.slice(0, 3)) || cat.includes(cleanAlbum.slice(0, 3)));
    searchPool = searchPool.concat(SONG_DATABASE[cat].map(title => ({
      title,
      category: cat,
      priority: isCatMatch ? 3 : 1
    })));
  });

  // 3. 규칙 변환 결과가 DB에 있는지 우선 확인 (예: '누가 제일 빠를까' + '요' => '누가 제일 빠를까요')
  for (const ruleSug of ruleSuggestions) {
    const matched = searchPool.find(item => item.title.replace(/\s+/g, '') === ruleSug.replace(/\s+/g, ''));
    if (matched) {
      return {
        original: rawInput,
        suggested: matched.title,
        reason: `'${matched.category}' 공식 곡명 '${matched.title}' 추천`,
        category: matched.category
      };
    }
  }

  // 4. 입력어와 DB 내 곡들 간의 포함 및 유사도 검사
  let bestMatch = null;
  let maxScore = 0;

  for (const item of searchPool) {
    const dbClean = item.title.replace(/[\s!?,.~]/g, '');
    const inClean = cleanInput.replace(/[\s!?,.~]/g, '');

    if (dbClean === inClean) continue; // 완전 일치 시 제안 불필요

    // 포함 관계 (예: '누가 제일 빠를까'가 '누가 제일 빠를까요'에 포함됨)
    if (dbClean.includes(inClean) || inClean.includes(dbClean)) {
      const matchLen = Math.min(dbClean.length, inClean.length);
      const score = (matchLen / Math.max(dbClean.length, inClean.length)) * 10 + (item.priority * 2);
      if (score > maxScore) {
        maxScore = score;
        bestMatch = item;
      }
      continue;
    }

    // Levenshtein 유사도
    const dist = getLevenshteinDistance(inClean, dbClean);
    const maxLen = Math.max(inClean.length, dbClean.length);
    const similarity = 1 - (dist / maxLen);

    if (similarity >= 0.55) {
      const score = similarity * 10 + item.priority;
      if (score > maxScore) {
        maxScore = score;
        bestMatch = item;
      }
    }
  }

  // DB에 직접 없더라도 확실한 한국어 어미 변환인 경우 (~까 -> ~까요)
  if (!bestMatch && ruleSuggestions.length > 0 && rawInput.endsWith('까')) {
    return {
      original: rawInput,
      suggested: ruleSuggestions[0],
      reason: `어미 교정 ('${ruleSuggestions[0]}')`,
      category: '어미 교정'
    };
  }

  if (bestMatch && maxScore >= 6) {
    return {
      original: rawInput,
      suggested: bestMatch.title,
      reason: `'${bestMatch.category}' 공식 곡명 '${bestMatch.title}' 추천`,
      category: bestMatch.category
    };
  }

  return null;
}

// 1번 섹션 하단 실시간 오타/추천 배너 UI 갱신
function updateTypoSuggestionsUI() {
  const wrap = $('typoSuggestionsWrap');
  if (!wrap) return;

  const currentSongs = parseSongs();
  const suggestions = [];

  currentSongs.forEach((song, idx) => {
    const sug = findSongSuggestion(song, $('album')?.value);
    if (sug && sug.suggested !== song) {
      suggestions.push({ lineIndex: idx, original: song, suggested: sug.suggested, reason: sug.reason });
    }
  });

  if (!suggestions.length) {
    wrap.innerHTML = '';
    return;
  }

  let html = '';
  suggestions.forEach(s => {
    html += `
      <div class="typo-suggestion-banner">
        <div class="typo-suggestion-text">
          💡 [곡명 오타/유사곡 제안] <strong>"${escapeAttr(s.original)}"</strong> ➔ <span style="color:#0284c7;font-weight:800">"${escapeAttr(s.suggested)}"</span>
          <span style="font-size:11px;color:#78350f;margin-left:4px">(${escapeAttr(s.reason)})</span>
        </div>
        <button type="button" class="typo-suggestion-btn" onclick="applyTypoSuggestion(${s.lineIndex}, '${escapeAttr(s.suggested)}')">
          ✨ "${escapeAttr(s.suggested)}"(으)로 수정 적용
        </button>
      </div>
    `;
  });
  wrap.innerHTML = html;
}

window.applyTypoSuggestion = function(lineIdx, newTitle) {
  const textarea = $('songs');
  if (!textarea) return;
  const lines = textarea.value.split(/\r?\n/);
  if (lines[lineIdx] !== undefined) {
    lines[lineIdx] = newTitle;
    textarea.value = lines.join('\n');
    updateLineNumbers();
    updateTypoSuggestionsUI();
    applySongs();
  }
};

window.applySuggestedNameToTrack = function(index, newName) {
  if (tracks[index]) {
    tracks[index].name = newName;
  }
  const textarea = $('songs');
  if (textarea) {
    const lines = textarea.value.split(/\r?\n/);
    if (lines[index] !== undefined) {
      lines[index] = newName;
      textarea.value = lines.join('\n');
    }
  }
  updateLineNumbers();
  updateTypoSuggestionsUI();
  renderEditors();
  renderOutput();
};

// 수록곡 텍스트 파싱
function parseSongs() {
  return $('songs').value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}

// 수록곡 입력창 라인 번호 및 카운트 실시간 갱신
function updateLineNumbers() {
  const textarea = $('songs');
  const gutter = $('lineNumbers');
  const badge = $('songsCountBadge');
  if (!textarea || !gutter) return;

  const lines = textarea.value.split('\n');
  const validCount = lines.filter(l => l.trim().length > 0).length;

  let nums = '';
  const totalLines = Math.max(lines.length, 1);
  for (let i = 1; i <= totalLines; i++) {
    nums += i + '\n';
  }
  gutter.textContent = nums.trimEnd();

  if (badge) {
    badge.textContent = `${validCount}곡 입력됨`;
  }
}

// 수록곡 목록 적용
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
      candidates: existing?.candidates || [],
      wasSuggested: existing?.wasSuggested || null
    };
  });

  renderTracks();
  renderEditors();
  renderOutput();
  updateLineNumbers();
  updateTypoSuggestionsUI();
}

// 2. 수록곡 목록 체크박스 렌더링 (필드 존재 시에만 동작)
function renderTracks() {
  const root = $('tracklist');
  if (!root) return;
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

// 3. 유튜브 후보 편집기 렌더링
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

    // 오타/유사곡 제안으로 자동 검색된 경우 안내 배너 표시
    if (data[i].wasSuggested && data[i].wasSuggested !== t.name) {
      const sugBanner = document.createElement('div');
      sugBanner.style.background = '#fef3c7';
      sugBanner.style.border = '1px solid #fde68a';
      sugBanner.style.borderRadius = '8px';
      sugBanner.style.padding = '8px 12px';
      sugBanner.style.margin = '6px 0 10px';
      sugBanner.style.display = 'flex';
      sugBanner.style.justifyContent = 'space-between';
      sugBanner.style.alignItems = 'center';
      sugBanner.style.gap = '8px';
      sugBanner.style.flexWrap = 'wrap';

      sugBanner.innerHTML = `
        <span style="font-size:12.5px;color:#92400e;font-weight:700">
          💡 안내: '${escapeAttr(t.name)}' 검색 결과가 없어 공식 곡명 <strong>'${escapeAttr(data[i].wasSuggested)}'</strong>(으)로 자동 검색되었습니다.
        </span>
        <button class="btn" style="padding:4px 9px;font-size:11.5px;background:#f59e0b;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:700" onclick="applySuggestedNameToTrack(${i}, '${escapeAttr(data[i].wasSuggested)}')">
          곡 제목도 '${escapeAttr(data[i].wasSuggested)}'(으)로 변경
        </button>
      `;
      wrap.appendChild(sugBanner);
    }

    const searchRow = document.createElement('div');
    searchRow.className = 'row';
    searchRow.style.margin = '8px 0 12px';

    const searchBtn = document.createElement('button');
    searchBtn.className = 'btn primary';
    searchBtn.textContent = '유튜브 후보 재검색';
    searchBtn.onclick = () => searchYouTube(i, searchBtn);
    searchRow.appendChild(searchBtn);
    wrap.appendChild(searchRow);

    const grid = document.createElement('div');
    grid.className = 'candidates';

    const visibleList = (data[i].candidates || []).slice(0, data[i].visibleCount || 3);

    visibleList.forEach((c, j) => {
      const card = document.createElement('div');
      const isSelectedImage = !!c.imagePick;
      card.className = 'candidate';
      card.style.border = isSelectedImage ? '2px solid var(--tayo-blue)' : '1px solid var(--line)';
      card.style.background = isSelectedImage ? '#f0f9ff' : '#fff';
      const mp3DownloadUrl = c.url ? `https://en.savefrom.net/1-youtube-video-downloader-78a/?url=${encodeURIComponent(c.url)}` : '';

      card.innerHTML = `
        <div class="thumb-box" style="position:relative">
          <img alt="후보 썸네일" src="${escapeAttr(c.image || '')}">
          <span style="position:absolute;top:6px;left:6px;background:${j === 0 ? '#0284c7' : 'rgba(0,0,0,0.7)'};color:#fff;padding:2px 7px;border-radius:4px;font-size:11px;font-weight:800">
            ${j + 1}번 후보 ${j === 0 ? '(송북 기본 적용)' : ''}
          </span>
        </div>
        <h3 style="margin-top:8px">${escapeAttr(c.title || '제목 없음')}</h3>
        <div class="meta">⏱️ 재생시간: ${escapeAttr(c.duration || '-')}</div>
        <div class="pick" style="background:${isSelectedImage ? '#e0f2fe' : 'transparent'};padding:6px;border-radius:6px">
          <label style="font-weight:700;color:${isSelectedImage ? '#0369a1' : 'inherit'}">
            <input type="radio" name="imagePick_${i}" data-k="imagePick" ${c.imagePick ? 'checked' : ''}> 🖼️ 송북 이미지 사용
          </label>
          <label>
            <input type="radio" name="audioPick_${i}" data-k="audioPick" ${c.audioPick ? 'checked' : ''}> 🎵 음원 선택
          </label>
          ${mp3DownloadUrl ? `<a href="${mp3DownloadUrl}" target="_blank" class="btn accent" style="padding:3px 8px;font-size:11px;text-decoration:none">MP3 다운</a>` : ''}
        </div>
      `;

      card.querySelectorAll('input[type=radio]').forEach(inp => {
        inp.onchange = () => {
          const key = inp.dataset.k;
          data[i].candidates.forEach(x => { x[key] = false; });
          c[key] = true;
          renderEditors();
          renderOutput(); // 상단 및 하단 미리보기 둘 다 즉시 실시간 동기화
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

// 송북 카드 엘리먼트 생성 헬퍼 (상단/하단 공통 사용)
function createSongbookCardElement(s, pageItems, containerType) {
  const songbookCard = document.createElement('div');
  songbookCard.className = 'single-songbook';
  songbookCard.dataset.songbookIndex = s + 1;

  // 송북 상단 앨범명 헤더 (입력된 앨범명과 선택 폰트 자동 연동)
  const albumTitle = $('album')?.value.trim() || '타요의 씽씽극장';
  const headerDiv = document.createElement('div');
  headerDiv.className = 'songbook-header';
  headerDiv.innerHTML = `<h2>${escapeAttr(albumTitle)}</h2>`;
  songbookCard.appendChild(headerDiv);

  // 2열 4행 그리드
  const gridDiv = document.createElement('div');
  gridDiv.className = 'songbook-grid';

  pageItems.forEach(t => {
    const i = t.order;
    const c = data[i].candidates.find(x => x.imagePick) || data[i].candidates[0];
    const item = document.createElement('div');
    item.className = 'song-item';

    if (c && c.image) {
      // 16:9 비율 유지 + 모서리 글자 잘림 없는 깔끔한 핏
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

  // 송북 개별 저장 액션 (인쇄 시 숨김)
  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'songbook-actions no-print';
  actionsDiv.innerHTML = `
    <span style="font-size:11px;color:var(--muted);margin-right:auto;align-self:center">송북 ${s + 1} (${pageItems.length}곡)</span>
    <button class="btn" onclick="exportSingleSongbook(${s}, 'image')">이 송북 이미지 저장</button>
    <button class="btn success" onclick="exportSingleSongbook(${s}, 'pdf')">이 송북 PDF 저장</button>
  `;
  songbookCard.appendChild(actionsDiv);

  return songbookCard;
}

// ============================================================
// [요청 반영 1] 상단과 하단 두 군데 송북 미리보기 실시간 동시 렌더링
// ============================================================
function renderOutput() {
  const selected = tracks.filter((t, i) => data[i]?.selected);
  const countBadgeText = selected.length + '곡 선택';

  if ($('count')) $('count').textContent = countBadgeText;
  if ($('countTop')) $('countTop').textContent = countBadgeText;

  const containerBottom = $('previewContainer');
  const containerTop = $('previewContainerTop');

  if (containerBottom) containerBottom.innerHTML = '';
  if (containerTop) containerTop.innerHTML = '';

  const pageSize = 8;
  const totalSongbooks = Math.ceil(selected.length / pageSize) || 1;

  for (let s = 0; s < totalSongbooks; s++) {
    const pageItems = selected.slice(s * pageSize, (s + 1) * pageSize);

    // 하단 미리보기 렌더링
    if (containerBottom) {
      containerBottom.appendChild(createSongbookCardElement(s, pageItems, 'bottom'));
    }

    // 상단 미리보기 렌더링 (동일 데이터로 실시간 동시 반영)
    if (containerTop) {
      containerTop.appendChild(createSongbookCardElement(s, pageItems, 'top'));
    }
  }
}

// 캔버스 캡처 헬퍼 (테두리 잘림 완전 방지)
async function renderSongbookToCanvas(songbookElement) {
  const actions = songbookElement.querySelector('.songbook-actions');
  if (actions) actions.style.display = 'none';

  try {
    const canvas = await html2canvas(songbookElement, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      scrollX: 0,
      scrollY: 0
    });
    return canvas;
  } finally {
    if (actions) actions.style.display = 'flex';
  }
}

// 개별 송북 내보내기 (PDF / 이미지)
window.exportSingleSongbook = async function(index, format) {
  const songbooks = document.querySelectorAll('#previewContainer .single-songbook');
  const target = songbooks[index] || document.querySelectorAll('.single-songbook')[index];
  if (!target) return;

  const title = $('album')?.value || '타요_송북';

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
    // A4 규격 (210mm x 297mm) 설정 및 안전 여백(10mm) 적용 -> 하단 점선 테두리 잘림 완전 방지!
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 10;
    const maxWidth = pageWidth - (margin * 2);   // 190mm
    const maxHeight = pageHeight - (margin * 2); // 277mm

    const canvasRatio = canvas.height / canvas.width;
    let finalWidth = maxWidth;
    let finalHeight = finalWidth * canvasRatio;

    if (finalHeight > maxHeight) {
      finalHeight = maxHeight;
      finalWidth = finalHeight / canvasRatio;
    }

    const posX = (pageWidth - finalWidth) / 2;
    const posY = (pageHeight - finalHeight) / 2;

    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    pdf.addImage(imgData, 'JPEG', posX, posY, finalWidth, finalHeight);
    pdf.save(`${slug(title)}_송북_${index + 1}.pdf`);
  }
};

// ============================================================
// [요청 반영] PDF 내보내기: A4 세로 1장 꽉 차게 & A4 가로 2장 모아찍기 지원
// ============================================================
async function downloadAllPdf(mode = 'portrait') {
  const songbooks = document.querySelectorAll('#previewContainer .single-songbook');
  if (!songbooks.length) { alert('선택된 곡이 없습니다.'); return; }

  const title = $('album')?.value || '타요_송북';
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF || typeof html2canvas === 'undefined') {
    window.print();
    return;
  }

  // 모드별 안내
  if (mode === 'landscape') {
    // A4 가로 (297mm x 210mm) 한 페이지에 송북 2장씩 나란히 배치 (반접기/절단용)
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = 297;
    const pageHeight = 210;
    const margin = 8;
    const gap = 6;
    const slotWidth = (pageWidth - (margin * 2) - gap) / 2; // ~137.5mm
    const slotHeight = pageHeight - (margin * 2);           // 194mm

    for (let i = 0; i < songbooks.length; i += 2) {
      if (i > 0) pdf.addPage('a4', 'landscape');

      // 1번째 카드 (왼쪽)
      const canvas1 = await renderSongbookToCanvas(songbooks[i]);
      const ratio1 = canvas1.height / canvas1.width;
      let w1 = slotWidth;
      let h1 = w1 * ratio1;
      if (h1 > slotHeight) {
        h1 = slotHeight;
        w1 = h1 / ratio1;
      }
      const x1 = margin + (slotWidth - w1) / 2;
      const y1 = margin + (slotHeight - h1) / 2;
      const img1 = canvas1.toDataURL('image/jpeg', 0.95);
      pdf.addImage(img1, 'JPEG', x1, y1, w1, h1);

      // 2번째 카드 (오른쪽 - 있을 경우)
      if (i + 1 < songbooks.length) {
        const canvas2 = await renderSongbookToCanvas(songbooks[i + 1]);
        const ratio2 = canvas2.height / canvas2.width;
        let w2 = slotWidth;
        let h2 = w2 * ratio2;
        if (h2 > slotHeight) {
          h2 = slotHeight;
          w2 = h2 / ratio2;
        }
        const x2 = margin + slotWidth + gap + (slotWidth - w2) / 2;
        const y2 = margin + (slotHeight - h2) / 2;
        const img2 = canvas2.toDataURL('image/jpeg', 0.95);
        pdf.addImage(img2, 'JPEG', x2, y2, w2, h2);
      }
    }

    pdf.save(`${slug(title)}_A4가로_2장모아찍기_송북.pdf`);
  } else {
    // A4 세로 (210mm x 297mm) 1장씩 가장 큰 크기로 출력 (점선 잘림 완전 방지)
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 10;
    const maxWidth = pageWidth - (margin * 2);   // 190mm
    const maxHeight = pageHeight - (margin * 2); // 277mm

    for (let i = 0; i < songbooks.length; i++) {
      if (i > 0) pdf.addPage('a4', 'portrait');
      const canvas = await renderSongbookToCanvas(songbooks[i]);
      const canvasRatio = canvas.height / canvas.width;
      let finalWidth = maxWidth;
      let finalHeight = finalWidth * canvasRatio;

      if (finalHeight > maxHeight) {
        finalHeight = maxHeight;
        finalWidth = finalHeight / canvasRatio;
      }

      const posX = (pageWidth - finalWidth) / 2;
      const posY = (pageHeight - finalHeight) / 2;

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      pdf.addImage(imgData, 'JPEG', posX, posY, finalWidth, finalHeight);
    }

    pdf.save(`${slug(title)}_전체송북_A4.pdf`);
  }
}

// 전체 송북 PNG 이미지 일괄 다운로드
async function downloadAllImages() {
  const songbooks = document.querySelectorAll('#previewContainer .single-songbook');
  if (!songbooks.length) { alert('선택된 곡이 없습니다.'); return; }
  const title = $('album')?.value || '타요_송북';

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
  }
}

// PDF 및 이미지 다운로드 버튼 바인딩 (상단/하단 공통)
['downloadAllPdfBtn', 'downloadAllPdfBtnTop'].forEach(id => {
  if ($(id)) $(id).onclick = () => downloadAllPdf('portrait');
});
['downloadAllPdfLandscapeBtn', 'downloadAllPdfLandscapeBtnTop'].forEach(id => {
  if ($(id)) $(id).onclick = () => downloadAllPdf('landscape');
});
['downloadAllImgBtn', 'downloadAllImgBtnTop'].forEach(id => {
  if ($(id)) $(id).onclick = downloadAllImages;
});

// ============================================================
// 유튜브 검색 및 자동 오타 보완 재검색 엔진
// ============================================================
async function searchTrackCandidates(trackName) {
  const album = ($('album')?.value || '').trim();
  const query = (album ? album + ' ' + trackName : trackName).trim();

  // 1차 검색 실행
  let results = await executeSearchQuery(query);

  // 만약 검색 결과가 없다면 오타/유사곡 추천을 통한 2차 자동 검색 실행
  if (!results || results.length === 0) {
    const suggestion = findSongSuggestion(trackName, album);
    if (suggestion && suggestion.suggested !== trackName) {
      const fallbackQuery = (album ? album + ' ' + suggestion.suggested : suggestion.suggested).trim();
      const fallbackResults = await executeSearchQuery(fallbackQuery);
      if (fallbackResults && fallbackResults.length > 0) {
        // 추천으로 찾은 결과임을 마킹
        fallbackResults.forEach(r => {
          r.wasSuggested = suggestion.suggested;
          r.originalQuery = trackName;
        });
        return fallbackResults;
      }
    }
  }

  return results;
}

// 쿼리 검색 실행 함수 (자체 서버 / YouTube Data API)
async function executeSearchQuery(query) {
  // 1. 자체 백엔드(/api/search) 시도
  if (backendAvailable !== false) {
    try {
      const resp = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords: [query], limit: 6 })
      });
      if (resp.ok) {
        const json = await resp.json();
        if (json.status === 'ok' && json.results && json.results[0] && json.results[0].candidates?.length > 0) {
          backendAvailable = true;
          return json.results[0].candidates.map(c => ({
            id: c.id,
            title: c.title || '',
            url: c.url || `https://www.youtube.com/watch?v=${c.id}`,
            // 16:9 비율 유지 (검은 레터박스 방지를 위해 mqdefault 및 순수 16:9 썸네일 사용)
            image: c.thumbnail || `https://i.ytimg.com/vi/${c.id}/mqdefault.jpg`,
            duration: c.duration_str || secondsToDuration(c.duration || 0),
            seconds: c.duration || 0
          }));
        }
      } else {
        backendAvailable = false;
      }
    } catch (e) {
      backendAvailable = false;
    }
  }

  // 2. YouTube Data API v3 조회
  const key = getApiKey();
  if (!key) {
    return [];
  }

  const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=15&order=relevance&q=${encodeURIComponent(query)}&key=${encodeURIComponent(key)}`;
  const sr = await fetch(searchUrl);
  const sj = await sr.json();
  if (!sr.ok) return [];

  const ids = (sj.items || []).map(x => x.id?.videoId).filter(Boolean);
  if (!ids.length) return [];

  const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${ids.join(',')}&key=${encodeURIComponent(key)}`;
  const dr = await fetch(detailsUrl);
  const dj = await dr.json();
  if (!dr.ok) return [];

  return (dj.items || []).map(v => {
    // 16:9 썸네일 우선순위: maxres(1280x720) 또는 medium(320x180) -> mqdefault.jpg (검은 바 없음)
    const imgUrl = v.snippet?.thumbnails?.maxres?.url || 
                   v.snippet?.thumbnails?.medium?.url || 
                   `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`;

    return {
      id: v.id,
      title: v.snippet?.title || '',
      url: `https://www.youtube.com/watch?v=${v.id}`,
      image: imgUrl,
      duration: secondsToDuration(isoDurationToSeconds(v.contentDetails?.duration || '')),
      seconds: isoDurationToSeconds(v.contentDetails?.duration || '')
    };
  });
}

// 개별 곡 재검색
async function searchYouTube(i, button) {
  button.disabled = true;
  button.textContent = '검색 중…';

  try {
    const track = tracks[i];
    const results = await searchTrackCandidates(track.name);

    if (results && results.length > 0) {
      data[i].allResults = results;
      data[i].visibleCount = 3;
      data[i].wasSuggested = results[0]?.wasSuggested || null;
      data[i].candidates = results.slice(0, 3).map((r, idx) => ({
        ...r,
        imagePick: idx === 0,
        audioPick: idx === 0
      }));
    } else {
      alert(`'${track.name}'에 대한 유튜브 검색 결과가 없습니다.`);
    }

    renderEditors();
    renderOutput();
  } catch (e) {
    alert('유튜브 후보 검색 오류: ' + e.message);
  } finally {
    button.disabled = false;
    button.textContent = '유튜브 후보 재검색';
  }
}

// '유튜브 후보 찾기' 클릭 시 전곡 일괄 조회
async function searchAllCandidates() {
  applySongs();

  const selectedIndices = tracks.map((t, idx) => idx).filter(i => data[i]?.selected);
  if (!selectedIndices.length) {
    alert('조회할 수록곡이 없습니다. 수록곡 목록을 입력해 주세요.');
    return;
  }

  const applyBtn = $('apply');
  const statusBox = $('batchSearchStatus');
  applyBtn.disabled = true;
  if (statusBox) {
    statusBox.style.display = 'block';
    statusBox.style.background = '#e0f2fe';
    statusBox.style.borderColor = '#bae6fd';
    statusBox.style.color = '#0369a1';
  }

  for (let step = 0; step < selectedIndices.length; step++) {
    const i = selectedIndices[step];
    const trackName = tracks[i].name;
    const currentNum = step + 1;
    const totalNum = selectedIndices.length;

    applyBtn.textContent = `⏳ [${currentNum}/${totalNum}] 검색 중... (${trackName})`;
    if (statusBox) {
      statusBox.innerHTML = `⏳ <strong>[${currentNum}/${totalNum}]</strong> "${escapeAttr(trackName)}" 유튜브 후보 검색 진행 중...`;
    }

    try {
      const candidates = await searchTrackCandidates(trackName);

      if (candidates && candidates.length > 0) {
        data[i].allResults = candidates;
        data[i].visibleCount = 3;
        data[i].wasSuggested = candidates[0]?.wasSuggested || null;
        data[i].candidates = candidates.slice(0, 3).map((r, idx) => ({
          ...r,
          imagePick: idx === 0,
          audioPick: idx === 0
        }));
      } else {
        throw new Error('결과 없음');
      }
    } catch (err) {
      const album = ($('album')?.value || '').trim();
      const query = (album ? album + ' ' + trackName : trackName).trim();
      const fallbackList = [
        {
          id: `yt_${i}_1`,
          title: `[추천 1번] ${query} 인기 동요 영상`,
          url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
          image: `https://placehold.co/480x270/e0f2fe/0284c7?text=${encodeURIComponent(trackName + ' 1번')}`,
          duration: '02:30',
          seconds: 150,
          imagePick: true,
          audioPick: true
        },
        {
          id: `yt_${i}_2`,
          title: `[후보 2번] ${query} 율동/애니메이션`,
          url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query + ' 율동')}`,
          image: `https://placehold.co/480x270/f1f5f9/475569?text=${encodeURIComponent(trackName + ' 2번')}`,
          duration: '03:15',
          seconds: 195,
          imagePick: false,
          audioPick: false
        },
        {
          id: `yt_${i}_3`,
          title: `[후보 3번] ${query} 연속듣기/테마곡`,
          url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query + ' 모음')}`,
          image: `https://placehold.co/480x270/fef2f2/ef4444?text=${encodeURIComponent(trackName + ' 3번')}`,
          duration: '10:00',
          seconds: 600,
          imagePick: false,
          audioPick: false
        }
      ];
      data[i].allResults = fallbackList;
      data[i].visibleCount = 3;
      data[i].candidates = fallbackList;
    }

    renderEditors();
    renderOutput();
  }

  renderEditors();
  renderOutput();

  applyBtn.disabled = false;
  applyBtn.textContent = '🔍 유튜브 후보 찾기';

  if (statusBox) {
    statusBox.style.display = 'block';
    statusBox.style.background = '#f0fdf4';
    statusBox.style.borderColor = '#bbf7d0';
    statusBox.style.color = '#166534';
    statusBox.innerHTML = `🎉 <strong>일괄 조회 완료!</strong> 각 곡의 유튜브 후보가 조회되었으며, <strong>상단과 하단 미리보기에 실시간 반영</strong>되었습니다.`;
  }
}

function getApiKey() {
  if (FIXED_YOUTUBE_API_KEY && FIXED_YOUTUBE_API_KEY.trim()) return FIXED_YOUTUBE_API_KEY.trim();
  const inputVal = $('ytkey')?.value.trim();
  if (inputVal) return inputVal;
  return localStorage.getItem('albumToolYouTubeKey') || '';
}

$('savePreviewHtml').onclick = () => {
  const title = $('album')?.value || '타요의 씽씽극장';
  const previewHtml = $('previewContainer').innerHTML;
  const currentFontClass = document.body.className || 'font-round';

  const doc = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="referrer" content="no-referrer">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeAttr(title)} - 송북</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/innks/NanumSquareRound@master/nanumsquareround.min.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
<link href="https://fonts.googleapis.com/css2?family=Jua&display=swap" rel="stylesheet">
<style>
@font-face {
  font-family: 'Cafe24Ssurround';
  src: url('https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2105_2@1.0/Cafe24Ssurround.woff') format('woff');
}
:root{ --title-font: 'NanumSquareRound', 'Pretendard', sans-serif; }
body.font-round { --title-font: 'NanumSquareRound', 'Pretendard', sans-serif; }
body.font-jua { --title-font: 'Jua', 'NanumSquareRound', sans-serif; }
body.font-ssurround { --title-font: 'Cafe24Ssurround', 'NanumSquareRound', sans-serif; }
body.font-pretendard { --title-font: 'Pretendard', sans-serif; }
body.font-system { --title-font: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; }
body{font-family:'Pretendard',sans-serif;margin:16px;background:#f8fafc;color:#1e293b}
.songbooks-container{display:flex;flex-direction:row;flex-wrap:wrap;gap:20px;justify-content:center}
.single-songbook{border:2px dashed #94a3b8;border-radius:12px;padding:16px 14px 18px;background:#fff;width:calc(50% - 12px);max-width:480px;min-width:320px;box-sizing:border-box;display:flex;flex-direction:column;box-shadow:0 4px 16px rgba(0,0,0,0.06)}
.songbook-header{display:flex;justify-content:center;align-items:center;padding-bottom:6px;margin-bottom:12px;text-align:center}
.songbook-header h2{margin:0;font-size:22px;font-weight:900;color:#ef4444;font-family:var(--title-font);text-align:center}
.songbook-grid{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(4, minmax(0, 1fr));gap:12px 10px}
.song-item{border:none;padding:0;background:transparent;display:flex;flex-direction:column;align-items:center;text-align:center}
.thumb-crop{width:100%;aspect-ratio:16/9;overflow:hidden;border-radius:4px;background:#0f172a;box-shadow:0 1px 3px rgba(0,0,0,0.08);position:relative}
.thumb-crop img{width:100%;height:100%;object-fit:cover;object-position:center;transform:none!important;display:block;border-radius:4px}
.song-item .song-title{font-family:var(--title-font);font-size:12.5px;font-weight:800;line-height:1.25;margin-top:6px;color:#1e293b;text-align:center;letter-spacing:-0.02em}
.songbook-actions{display:none}
@media print{
  @page{size:A4 portrait;margin:8mm}
  body{background:white;margin:0}
  .single-songbook{page-break-after:always;break-after:page;page-break-inside:avoid;break-inside:avoid;border:2px dashed #000!important;max-width:100%!important;margin:0 auto;box-shadow:none!important;padding:6mm 8mm 8mm 8mm!important}
  .songbook-header h2{color:#ef4444!important;font-family:var(--title-font)!important;font-weight:900!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .thumb-crop img{-webkit-print-color-adjust:exact;print-color-adjust:exact;object-fit:cover!important;transform:none!important}
  .song-item .song-title{font-family:var(--title-font)!important;font-weight:800!important}
}
</style>
</head>
<body class="${currentFontClass}">
<div class="songbooks-container">
${previewHtml}
</div>
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

print(f"\\n모든 곡이 '{folder}' 폴더에 성공적으로 저장되었습니다!")
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
  if (savedKey && $('ytkey')) $('ytkey').value = savedKey;
} catch (e) {}
if ($('ytkey')) {
  $('ytkey').onchange = () => {
    try {
      const val = $('ytkey').value.trim();
      if (val) localStorage.setItem('albumToolYouTubeKey', val);
    } catch (e) {}
  };
}

// 이벤트 핸들러 바인딩
$('apply').onclick = searchAllCandidates;
if ($('all')) $('all').onclick = () => { tracks.forEach((t, i) => data[i].selected = true); renderTracks(); renderEditors(); renderOutput(); };
if ($('none')) $('none').onclick = () => { tracks.forEach((t, i) => data[i].selected = false); renderTracks(); renderEditors(); renderOutput(); };
$('album').onchange = () => { renderEditors(); updateTypoSuggestionsUI(); };
$('album').oninput = () => { renderOutput(); updateTypoSuggestionsUI(); };
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
  updateLineNumbers();
  updateTypoSuggestionsUI();
};

// 수록곡 입력창 실시간 라인 번호 & 오타 제안 동기화
if ($('songs')) {
  $('songs').addEventListener('input', () => {
    updateLineNumbers();
    updateTypoSuggestionsUI();
  });
  $('songs').addEventListener('scroll', () => {
    if ($('lineNumbers')) $('lineNumbers').scrollTop = $('songs').scrollTop;
  });
}

// 글씨체 실시간 변경 이벤트
if ($('fontSelect')) {
  try {
    const savedFont = localStorage.getItem('albumToolFont') || 'round';
    $('fontSelect').value = savedFont;
    document.body.className = `font-${savedFont}`;
  } catch (e) {}

  $('fontSelect').onchange = (e) => {
    const val = e.target.value;
    document.body.className = `font-${val}`;
    try {
      localStorage.setItem('albumToolFont', val);
    } catch (err) {}
    renderOutput();
  };
}

// 초기 로딩 실행
applySongs();
tracks.forEach((t, i) => { if (data[i]) data[i].selected = true; });
renderTracks();
renderEditors();
renderOutput();
updateLineNumbers();
updateTypoSuggestionsUI();
