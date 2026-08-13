# Weather Mockup 컴포넌트 구조

```text
components/
├── common/
│   ├── BaseDashboardCard.vue
│   └── UnitToggle.vue
└── weather/
    ├── WeatherHome.vue
    ├── SearchBar.vue
    ├── WeatherCard.vue
    ├── WeatherMap.vue
    ├── LiveSun.vue
    ├── WeatherVideoBackground.vue
    └── utils/
        └── 배경 계산은 src/features/weather-scene에서 관리

stores/configStore.js
composables/useTemperature.js
data/weather/
├── regions.js
└── districts.js
```

## 역할

- `WeatherHome.vue`: 반응형 상태, 지도, 모드 전환, 상세 모달을 관리합니다.
- `../../api/`: Axios 공통 설정과 기상청 HTTP 요청을 관리합니다.
- `../../services/kmaWeather.js`: 기상청 응답을 화면용 날씨 객체로 변환합니다.
- `../../data/weather/regions.js`: 대한민국 17개 지역의 이름과 좌표처럼 변하지 않는 원본 데이터를 관리합니다.
- `../../data/weather/districts.js`: 광역시·도 선택 후 요청할 전국 229개 시·군·구 중심 좌표를 관리합니다.
- `features/weather-scene`: 날씨 코드, 강수, 구름량, 풍속, 시간대로 배경 그룹을 결정합니다.
- `BaseDashboardCard.vue`: 공통 카드 디자인과 슬롯 영역을 제공합니다.
- `SearchBar.vue`: 검색어를 props로 받고 변경된 입력값을 emit으로 부모에게 전달합니다.
- `WeatherCard.vue`: 지역 날씨를 props로 받고 카드 선택·상세보기·풍경 보기 이벤트를 emit으로 전달합니다.
- `WeatherMap.vue`: 광역시·도 대표 핀만 표시하고 선택 이벤트를 부모에게 전달합니다.
- `WeatherVideoBackground.vue`: 두 개의 영상을 미리 로드하고 종료 전에 교차 재생합니다.
- `UnitToggle.vue`: 내비게이션에서 섭씨·화씨 단위를 전환합니다.
- `configStore.js`: 내비게이션·홈·지도·풍경·상세 화면이 공유하는 단위, 보기 모드, 풍경 정보 패널 상태와 action을 관리합니다.
- `useTemperature.js`: 메인·지도·상세 화면의 온도 변환을 공통 처리합니다.

## 창가 모드 데이터 흐름

1. 기상청 초단기실황에서 현재 기온, 습도, 강수 형태·강수량, 풍향과 풍속을 받고 가장 가까운 초단기예보에서 하늘 상태를 받습니다.
2. 기상청 응답에 없는 일출·일몰 같은 풍경 보조값은 앱의 계절·좌표 기반 계산값으로 보완합니다.
3. `features/weather-scene`이 날씨 코드와 수치를 장면 그룹으로 변환합니다.
4. 구름 영상, 강수 효과, 시간대 색감과 계산된 태양 위치를 하나의 하늘 장면으로 합성합니다.
5. 창가 모드의 `하늘 해석 엔진`과 퇴근길 패널에서 장면 계산값과 생활 안내를 확인합니다.

모든 자식은 `WeatherHome.vue`와 직접 통신하므로 중간 컴포넌트가 props를 전달만 하는 Prop Drilling 구조가 없습니다.
