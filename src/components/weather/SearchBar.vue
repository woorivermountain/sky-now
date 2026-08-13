<script setup>
// 검색 상태는 부모가 소유하고, 자식은 props와 emits로만 통신합니다.
defineProps({
  searchQuery: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['update:searchQuery'])

function updateSearchQuery(event) {
  emit('update:searchQuery', event.target.value)
}
</script>

<template>
  <div class="search-bar">
    <label for="city-search">도시 또는 지역 검색</label>
    <input
      id="city-search"
      type="search"
      :value="searchQuery"
      placeholder="예: 서울, 제주, 경기"
      @input="updateSearchQuery"
    />
    <p>{{ searchQuery ? `“${searchQuery}” 검색 결과` : '전체 지역 목록' }}</p>
  </div>
</template>

<style scoped>
.search-bar {
  width: 100%;
  padding: 15px;
}

label {
  display: block;
  margin-bottom: 9px;
  color: #dbeafe;
  font-size: 13px;
  font-weight: 700;
}

input {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid rgba(255, 255, 255, 0.48);
  border-radius: 10px;
  outline: none;
  background: rgba(15, 23, 42, 0.14);
  color: white;
  font-size: 15px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

input:focus {
  border-color: rgba(255, 255, 255, 0.9);
  box-shadow: 0 0 0 4px rgba(219, 234, 254, 0.16);
}

input::placeholder {
  color: #dbeafe;
}

p {
  margin: 9px 0 0;
  color: #dbeafe;
  font-size: 12px;
}
</style>
