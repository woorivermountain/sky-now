<template>
  <main class="not-found-page">
    <p>404</p>
    <h1>요청한 날씨 화면을 찾을 수 없습니다.</h1>
    <span>주소를 다시 확인하거나 날씨 홈으로 돌아가 주세요.</span>
    <RouterLink to="/weather">날씨 홈으로 돌아가기</RouterLink>
  </main>
</template>

<style scoped>
.not-found-page {
  display: grid;
  width: min(760px, calc(100% - 40px));
  min-height: calc(100vh - 62px);
  align-content: center;
  justify-items: start;
  margin: 0 auto;
}

p {
  margin: 0;
  color: #60a5fa;
  font-size: 74px;
  font-weight: 900;
  letter-spacing: -0.08em;
}

h1 {
  margin: 0;
  color: #102a4c;
  font-size: clamp(34px, 6vw, 60px);
  line-height: 1.08;
  letter-spacing: -0.06em;
}

span {
  margin: 18px 0 30px;
  color: #64748b;
  font-size: 17px;
}

a {
  padding: 12px 17px;
  border-radius: 999px;
  background: #1d4ed8;
  color: white;
  font-weight: 800;
}
</style>
