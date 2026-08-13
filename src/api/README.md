# API 계층

외부 API 요청 코드만 이 폴더에서 관리합니다. 화면 컴포넌트는 API 주소나 인증키를 직접 알지 않습니다.

## 현재 사용 중

- `httpClient.js`: Axios 공통 설정, 제한 시간, 오류 메시지 변환
- `kmaApi.js`: 기상청 초단기실황·초단기예보 요청
- `astronomyApi.js`: 한국천문연구원 지역별 일출·일몰·박명 요청
- 인증키: `.env.local`의 `KMA_SERVICE_KEY`를 Vite 서버 프록시에서만 사용
- 천문 인증키: `.env.local`의 `ASTRONOMY_SERVICE_KEY`를 Vite 서버 프록시에서만 사용

## 역할 분리

1. `src/api/`: HTTP 요청과 응답 유효성 확인
2. `src/services/`: 기상청 category 값을 화면용 날씨 객체로 변환
3. `src/components/`: 변환된 날씨를 표시하고 사용자 이벤트 처리

## OpenWeatherMap

현재 프로젝트에는 `OPENWEATHER_API_KEY`가 없어 실제 요청에 사용하지 않습니다. 키를 발급받아 연결할 경우
`src/api/openWeatherApi.js`를 추가하고, 기상청과 마찬가지로 서버 프록시에서 키를 숨겨 사용합니다.
