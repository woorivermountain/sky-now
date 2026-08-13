# SKY NOW

기상청 날씨와 한국천문연구원 일출·일몰 데이터를 빛, 구름, 태양 위치와 강수 효과로 번역하는 Vue 기반 디지털 창문 서비스입니다.

## 주요 기능

- 대한민국 광역시·도 및 시·군·구 날씨 검색
- 전국 지도와 평균 기온 기준 상대 온도 표시
- 지역별 현재 날씨와 상세 기상 정보
- 시간대·구름량·강수·풍속을 반영한 디지털 창문
- 지역별 일출·일몰과 태양 위치 표현
- 섭씨·화씨 전역 설정

## 사용 기술

- Vue 3 Composition API
- Vue Router
- Pinia
- Axios
- Leaflet + OpenStreetMap
- Vite

## 데이터 소스

- 기상청 단기예보 조회서비스: 초단기실황 및 초단기예보
- 한국천문연구원 출몰시각 정보: 지역별 일출·일몰 및 박명
- Browser Geolocation: 현재 좌표와 가장 가까운 프로젝트 지역 탐색

API 인증키는 소스에 작성하지 않고 프로젝트 루트의 `.env.local`에서 관리합니다.

```dotenv
KMA_SERVICE_KEY=발급받은_기상청_인증키
ASTRONOMY_SERVICE_KEY=발급받은_천문_인증키
```

키 값이 없는 `.env.example`은 환경변수 이름을 안내하기 위해 Git에 포함합니다.

## 프로젝트 구조

```text
src/
├── api/                    # 외부 API HTTP 요청과 응답 오류 처리
├── components/
│   ├── common/             # 슬롯 카드와 온도 토글 등 공통 UI
│   └── weather/            # 지도, 카드, 검색, 영상과 태양 표현
├── composables/            # 재사용 가능한 Composition API 로직
├── data/
│   └── weather/            # 지역명과 좌표 같은 고정 원본 데이터
├── features/
│   └── weather-scene/      # 날씨 분류, 팔레트, 영상 선택 엔진
├── router/                 # 페이지 라우팅
├── services/               # API 응답 정규화 및 도메인 데이터 결합
├── stores/                 # Pinia 전역 설정 상태
└── views/                  # 라우터로 표시하는 페이지
```

Vue 강의 실습 코드는 서비스 빌드에서 제외하고 형제 폴더 `vue-course-labs`에 별도로 보관합니다.

## 실행

```sh
npm install
npm run dev
```

## 품질 검사

```sh
npm run lint
npm run build
```

자동 수정을 적용하려면 별도 명령을 사용합니다.

```sh
npm run lint:fix
```

## 배포 참고

현재 `/api/kma-weather`와 `/api/astronomy` 프록시는 Vite 개발 서버 미들웨어로 동작합니다. 정적 호스팅에 배포할 때는 인증키를 보호할 수 있는 서버리스 함수 또는 별도 백엔드 프록시가 필요합니다.

Vue Router가 History 모드를 사용하므로 운영 호스팅에는 모든 페이지 요청을 `index.html`로 연결하는 SPA rewrite 설정도 필요합니다.

배경 영상은 초기 번들 크기와 네트워크 비용을 줄이기 위해 운영 환경에서 CDN 또는 미디어 스토리지로 분리하는 것을 권장합니다.
