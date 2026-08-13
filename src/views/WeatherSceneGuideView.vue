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
      선택 지역의 기상청 실황·예보와 천문연구원 일출·일몰을 정규화한 뒤
      장면 분류, 영상 선택, 태양 궤적과 강수 효과를 조합해 바깥의 빛과 움직임을 구성합니다.
    </p>

    <div class="flow">
      <article><span>01 · INPUT</span><strong>지역 데이터 수집</strong><small>기온·습도·강수·풍속은 기상청 실황과 예보에서, 일출·일몰·박명은 천문연구원 XML에서
          받습니다.</small></article>
      <i>→</i>
      <article><span>02 · ENGINE</span><strong>장면 프로필 계산</strong><small>현재 시각의 낮 진행률과 날씨 코드를 이용해 팔레트, 태양 위치, 구름 농도와 강수 강도를
          계산합니다.</small></article>
      <i>→</i>
      <article><span>03 · OUTPUT</span><strong>레이어로 자연스럽게 합성</strong><small>원본 속도의 영상, 절차형 태양, 색상 팔레트와 비·눈 Canvas를 겹치고 장면 전환을
          부드럽게 연결합니다.</small></article>
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
          <p>구름량은 영상 농도로 반영하고, 풍속과 움직임 지수가 가까운 원본 영상을 선택합니다. 압축 노이즈를 줄이기 위해 재생 속도는 바꾸지 않습니다.</p>
        </article>
        <article><span>날씨 효과</span><strong>Weather Code</strong>
          <p>PTY·RN1·날씨 코드로 이슬비, 약한 비, 보통 비, 강한 비, 소나기, 눈과 뇌우를 세분화합니다.</p>
        </article>
        <article><span>장면 전환</span><strong>선택 소스 + Crossfade</strong>
          <p>선택 지역이나 날씨가 바뀔 때 영상 레이어와 팔레트를 단계적으로 전환해 화면이 갑자기 끊기는 느낌을 줄입니다.</p>
        </article>
        <article><span>성능 제어</span><strong>Visibility + Lifecycle</strong>
          <p>화면 밖 영상, 비활성 탭과 강수 Canvas는 일시 중지하고 컴포넌트가 사라질 때 타이머와 이벤트를 정리합니다.</p>
        </article>
      </div>
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
.section-heading p {
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

.formula-section {
  margin-top: 100px;
}

.section-heading h2 {
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

.parameter-grid p {
  margin: 0;
  color: #64748b;
  line-height: 1.7;
}

.guide-cta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  margin-top: 72px;
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
