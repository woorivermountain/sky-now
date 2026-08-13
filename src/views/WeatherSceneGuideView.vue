<script setup>
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <main class="guide-page">
    <button @click="router.back()">← 이전 화면</button>
    <p class="eyebrow">DIGITAL WINDOW ENGINE</p>
    <h1><span>날씨 데이터가</span><span>디지털 창문이 되는 과정</span></h1>
    <p class="guide-lead">
      SKY NOW의 디지털 창문은 정해진 배경 하나를 재생하는 방식이 아닙니다.
      선택 지역의 현재 날씨와 일출·일몰을 계산해 바깥의 빛과 움직임을 구성합니다.
    </p>

    <div class="flow">
      <article><span>01 · INPUT</span><strong>지역 날씨 수집</strong><small>기온, 습도, 강수량과 풍속은 기상청 실황에서, 하늘 상태는 가장 가까운 초단기예보에서
          받습니다.</small></article>
      <i>→</i>
      <article><span>02 · ENGINE</span><strong>실시간 장면 계산</strong><small>현재 시각이 일출과 일몰 사이 어디에 있는지 계산하고 날씨 코드를 장면 단계로
          분류합니다.</small></article>
      <i>→</i>
      <article><span>03 · OUTPUT</span><strong>디지털 창문에 반영</strong><small>태양 위치, 화면 밝기, 구름 농도, 영상 소스, 비·눈 효과에 계산값을
          적용합니다.</small></article>
    </div>

    <section class="formula-section">
      <div class="section-heading">
        <p>SKY PARAMETERS</p>
        <h2>현재 구현된 장면 조절 항목</h2>
      </div>
      <div class="parameter-grid">
        <article><span>태양 위치</span><strong>현재 시각 ÷ 낮 길이</strong>
          <p>일출에서 일몰까지의 진행률로 해의 가로 위치와 높이를 계산합니다.</p>
        </article>
        <article><span>화면 밝기</span><strong>낮 단계 + 구름량</strong>
          <p>정오에 가장 밝고 일출·일몰에 낮아지며 흐릴수록 전체 밝기를 줄입니다.</p>
        </article>
        <article><span>구름 영상</span><strong>구름량 + 풍속</strong>
          <p>구름량은 영상 농도, 풍속은 영상 재생 속도에 반영합니다.</p>
        </article>
        <article><span>날씨 효과</span><strong>Weather Code</strong>
          <p>맑음, 흐림, 안개, 비, 눈, 뇌우를 구분해 서로 다른 장면과 효과를 적용합니다.</p>
        </article>
      </div>
    </section>

    <section class="roadmap-section">
      <div>
        <p>SCENERY ROADMAP</p>
        <h2>하루의 흐름과 퇴근길을 더 잘 느끼도록 확장할 예정입니다.</h2>
      </div>
      <ul>
        <li><span>01</span>
          <div><strong>날씨별 영상 소스 확장</strong>
            <p>맑음·옅은 구름·짙은 흐림·약한 비·폭우·눈·안개 등 더 세밀한 단계의 영상을 확보합니다.</p>
          </div>
        </li>
        <li><span>02</span>
          <div><strong>퇴근길 날씨 안내 확장</strong>
            <p>퇴근 시각의 비, 바람, 체감온도와 일몰 여부를 한 문장으로 안내합니다.</p>
          </div>
        </li>
        <li><span>03</span>
          <div><strong>시간대별 장면 품질 개선</strong>
            <p>새벽, 일출, 정오, 골든아워, 일몰, 야간의 색감과 전환을 더 자연스럽게 다듬습니다.</p>
          </div>
        </li>
        <li><span>04</span>
          <div><strong>경로와 도착지 날씨 연동</strong>
            <p>출발지와 도착지의 날씨 차이, 예상 이동 시간과 귀가 시점의 하늘을 연결할 예정입니다.</p>
          </div>
        </li>
      </ul>
    </section>

    <div class="guide-cta">
      <p>설명에서 본 계산 결과를 실제 지역 날씨로 확인해 보세요.</p>
      <RouterLink to="/weather">디지털 창문 사용해 보기 →</RouterLink>
    </div>
  </main>
</template>

<style scoped>
.guide-page {
  width: min(1120px, calc(100% - 40px));
  margin: 0 auto;
  padding: clamp(48px, 8vw, 100px) 0;
  word-break: keep-all;
  overflow-wrap: break-word;
}

button {
  margin-bottom: 44px;
  padding: 10px 14px;
  border: 1px solid #bfdbfe;
  border-radius: 999px;
  background: white;
  color: #1d4ed8;
  cursor: pointer;
  font-weight: 800;
}

.eyebrow,
.section-heading p,
.roadmap-section>div>p {
  margin: 0 0 10px;
  color: #2563eb;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.16em;
}

h1 {
  max-width: 800px;
  margin: 0;
  color: #102a4c;
  font-size: clamp(42px, 6vw, 72px);
  line-height: 1.04;
  letter-spacing: -0.045em;
}

h1 span {
  display: block;
}

.guide-lead {
  max-width: 800px;
  margin: 26px 0 0;
  color: #64748b;
  font-size: 18px;
  line-height: 1.8;
}

.flow {
  display: grid;
  grid-template-columns: 1fr auto 1fr auto 1fr;
  align-items: stretch;
  gap: 16px;
  margin: 48px 0;
}

.flow article {
  display: grid;
  min-height: 230px;
  align-content: center;
  gap: 9px;
  padding: 26px;
  border: 1px solid #dbe5f0;
  border-radius: 22px;
  background: white;
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.07);
}

.flow span {
  color: #60a5fa;
  font-weight: 900;
}

.flow strong {
  color: #123c83;
  font-size: 21px;
}

.flow small {
  color: #64748b;
  font-size: 14px;
  line-height: 1.6;
}

.flow i {
  align-self: center;
  color: #93c5fd;
  font-size: 28px;
  font-style: normal;
}

.formula-section,
.roadmap-section {
  margin-top: 100px;
}

.section-heading h2,
.roadmap-section h2 {
  max-width: 800px;
  margin: 0;
  color: #102a4c;
  font-size: clamp(32px, 5vw, 52px);
  line-height: 1.08;
  letter-spacing: -0.05em;
}

.parameter-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-auto-rows: 1fr;
  gap: 14px;
  margin-top: 34px;
}

.parameter-grid article {
  padding: 25px;
  border: 1px solid #dbe5f0;
  border-radius: 20px;
  background: white;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.05);
  height: 100%;
}

.parameter-grid span,
.parameter-grid strong {
  display: block;
}

.parameter-grid span {
  color: #2563eb;
  font-size: 12px;
  font-weight: 850;
}

.parameter-grid strong {
  margin: 7px 0;
  color: #123c83;
  font-size: 20px;
}

.parameter-grid p,
.roadmap-section li p {
  margin: 0;
  color: #64748b;
  line-height: 1.7;
}

.roadmap-section {
  padding: clamp(28px, 5vw, 52px);
  border-radius: 28px;
  background: #dfeefa;
}

.roadmap-section ul {
  display: grid;
  gap: 10px;
  margin: 36px 0 0;
  padding: 0;
  list-style: none;
}

.roadmap-section li {
  display: grid;
  grid-template-columns: 46px 1fr;
  gap: 14px;
  padding: 20px;
  border: 1px solid #c8ddec;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.7);
}

.roadmap-section li>span {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 50%;
  background: #1d4ed8;
  color: white;
  font-size: 11px;
  font-weight: 900;
}

.roadmap-section li strong {
  display: block;
  margin-bottom: 5px;
  color: #123c83;
  font-size: 17px;
}

.guide-cta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  margin-top: 22px;
  padding: 26px 30px;
  border-radius: 20px;
  background: #102a4c;
  color: white;
}

.guide-cta p {
  margin: 0;
  color: #dbeafe;
}

.guide-cta a {
  display: inline-block;
  flex: 0 0 auto;
  padding: 12px 17px;
  border-radius: 999px;
  background: #1d4ed8;
  color: white;
  font-weight: 800;
}

@media (max-width: 760px) {
  .flow {
    grid-template-columns: 1fr;
  }

  .flow i {
    text-align: center;
    transform: rotate(90deg);
  }

  .parameter-grid {
    grid-template-columns: 1fr;
  }

  .guide-cta {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
