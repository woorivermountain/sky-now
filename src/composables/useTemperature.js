import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useConfigStore } from '../stores/configStore'

// 메인·상세 화면에서 온도 변환 코드를 중복하지 않도록 분리한 composable입니다.
export function useTemperature() {
  const configStore = useConfigStore()
  const { unit, unitSymbol } = storeToRefs(configStore)

  function displayTemp(celsius, fractionDigits = 0) {
    if (celsius === null || celsius === undefined || Number.isNaN(Number(celsius))) return '—'

    const converted = unit.value === 'fahrenheit'
      ? Number(celsius) * 9 / 5 + 32
      : Number(celsius)

    return Number(converted.toFixed(fractionDigits))
  }

  const isFahrenheit = computed(() => unit.value === 'fahrenheit')

  return { configStore, displayTemp, isFahrenheit, unit, unitSymbol }
}
