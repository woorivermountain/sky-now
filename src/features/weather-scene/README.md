# Weather Scene Engine

기상청 API 응답을 화면 풍경으로 바꾸는 코드만 모아 둔 계층입니다.

- `sceneClassifier.js`: `PTY`, `RN1`, `SKY`, 습도와 풍속을 장면 그룹으로 분류합니다.
- `sceneProfiles.js`: 화면에 표시할 장면 이름과 설명을 관리합니다.
- `mediaManifest.js`: 맑음, 구름, 흐림·비, 일몰, 밤의 로컬 영상 묶음을 관리하며 모든 영상은 원본 속도로 재생합니다.
- `precipitationVisuals.js`: 강수 단계별 Canvas 밀도, 속도, 길이를 관리합니다.
- `scenePalette.js`: 일출부터 일몰까지의 하늘색을 연속 보간합니다.

API 요청은 `src/api`, 기상청 응답 변환은 `src/services`, 풍경 표현은 이 폴더가 담당합니다.
