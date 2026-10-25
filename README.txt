앨범 썸네일 도구 PWA 패키지
포함 파일:
- index.html: 앱 본체
- manifest.webmanifest: 홈 화면 설치 정보
- service-worker.js: 앱 파일 캐시
- icon-192.png / icon-512.png: 앱 아이콘

설치 방법 개요:
1. 이 폴더 안의 파일을 모두 HTTPS 호스팅에 올립니다(예: GitHub Pages).
2. 배포된 HTTPS 주소를 iPhone Safari에서 엽니다.
3. 공유 버튼 → 홈 화면에 추가를 선택합니다.
4. 유튜브 자동 검색에는 인터넷 연결과 YouTube Data API 키가 필요합니다.

주의:
- 로컬 HTML 파일만으로는 PWA 설치가 안정적으로 되지 않습니다.
- 브라우저에 API 키를 저장하면 기기 사용자에게 노출될 수 있습니다. API 키는 YouTube Data API v3로 제한하고, 가능하면 호스팅 도메인 제한을 설정하세요.
- 이 패키지는 PWA 설치 구조를 추가한 준비물이며, 실제 호스팅 후 iPhone에서 최종 동작 테스트가 필요합니다.
