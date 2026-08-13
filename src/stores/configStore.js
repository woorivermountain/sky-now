import { defineStore } from 'pinia'

function getSavedUnit() {
  if (typeof window === 'undefined') return 'celsius'
  return window.localStorage.getItem('sky-now-temperature-unit') === 'fahrenheit'
    ? 'fahrenheit'
    : 'celsius'
}

export const useConfigStore = defineStore('config', {
  state: () => ({
    // 과제 필수 state: 사용자가 선택한 온도 단위를 전역으로 관리합니다.
    unit: getSavedUnit(),
    // 홈 상단, 대시보드, 풍경 화면이 함께 참조하는 현재 보기 모드입니다.
    viewMode: 'dashboard',
    // 풍경 툴바와 정보 패널이 함께 참조하는 열림 상태입니다.
    isLandscapeInfoOpen: false,
  }),

  getters: {
    // 과제 필수 getter: 현재 단위에 맞는 기호를 반환합니다.
    unitSymbol: (state) => state.unit === 'celsius' ? '°C' : '°F',
    // 나만의 추가 getter: 화면과 접근성 문구에서 사용할 단위 이름입니다.
    unitName: (state) => state.unit === 'celsius' ? '섭씨' : '화씨',
    // 내비게이션에서도 현재 홈 화면 모드를 읽을 수 있습니다.
    viewModeLabel: (state) => state.viewMode === 'landscape' ? '디지털 창문' : '날씨 대시보드',
  },

  actions: {
    // 과제 필수 action: 섭씨와 화씨를 전환합니다.
    toggleUnit() {
      this.unit = this.unit === 'celsius' ? 'fahrenheit' : 'celsius'
      window.localStorage.setItem('sky-now-temperature-unit', this.unit)
    },
    openLandscapeMode() {
      this.viewMode = 'landscape'
      this.isLandscapeInfoOpen = false
    },
    openDashboardMode() {
      this.viewMode = 'dashboard'
    },
    hideLandscapeInfo() {
      this.isLandscapeInfoOpen = false
    },
    toggleLandscapeInfo() {
      this.isLandscapeInfoOpen = !this.isLandscapeInfoOpen
    },
  },
})
