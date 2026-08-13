<script setup>
import { computed } from 'vue'

const props = defineProps({
  x: { type: Number, default: 50 },
  y: { type: Number, default: 30 },
  opacity: { type: Number, default: 1 },
  phase: { type: String, default: 'midday' },
})

const sunStyle = computed(() => ({
  '--live-sun-x': `${props.x}%`,
  '--live-sun-y': `${props.y}%`,
  '--live-sun-opacity': Math.min(1, Math.max(0, props.opacity)),
}))

const isHidden = computed(() => ['night', 'dawn', 'dusk'].includes(props.phase))
</script>

<template>
  <div
    class="live-sun-system"
    :class="[`live-sun-system--${phase}`, { 'is-hidden': isHidden }]"
    :style="sunStyle"
    aria-hidden="true"
  >
    <div class="live-sun-aura"></div>
    <div class="live-sun-prism"></div>
    <div class="live-sun-ghost live-sun-ghost--near"></div>
    <div class="live-sun-ghost live-sun-ghost--far"></div>
    <div class="live-sun-glow"></div>
    <div class="live-sun-disc">
      <img src="/weather-mockup/images/realistic-sun.png" alt="" />
    </div>
  </div>
</template>

<style scoped>
.live-sun-system {
  position: absolute;
  z-index: 2;
  inset: 0;
  pointer-events: none;
}

.live-sun-glow,
.live-sun-disc,
.live-sun-aura,
.live-sun-prism,
.live-sun-ghost {
  position: absolute;
  top: var(--live-sun-y);
  left: var(--live-sun-x);
  border-radius: 50%;
  opacity: var(--live-sun-opacity);
  transform: translate(-50%, -50%);
  transition: top 1s linear, left 1s linear, opacity 1.2s ease;
}

.live-sun-aura {
  width: clamp(210px, 23vw, 390px);
  aspect-ratio: 1;
  opacity: calc(var(--live-sun-opacity) * .58);
  background:
    radial-gradient(circle, rgba(255, 255, 255, .17) 0 7%, rgba(229, 246, 255, .075) 30%, transparent 68%),
    conic-gradient(from 32deg, rgba(124, 211, 255, .05), rgba(255, 196, 223, .045), rgba(255, 234, 153, .04), rgba(124, 211, 255, .05));
  filter: blur(18px);
  mix-blend-mode: screen;
}

.live-sun-prism {
  width: clamp(92px, 10vw, 170px);
  aspect-ratio: 1;
  opacity: calc(var(--live-sun-opacity) * .13);
  background: conic-gradient(
    from 205deg,
    rgba(255, 112, 124, .55),
    rgba(255, 214, 122, .42),
    rgba(133, 235, 204, .38),
    rgba(116, 190, 255, .48),
    rgba(210, 139, 255, .4),
    rgba(255, 112, 124, .55)
  );
  filter: blur(7px);
  mix-blend-mode: screen;
  -webkit-mask: radial-gradient(circle, transparent 0 50%, #000 60% 68%, transparent 80%);
  mask: radial-gradient(circle, transparent 0 50%, #000 60% 68%, transparent 80%);
}

.live-sun-ghost {
  border: 1px solid rgba(174, 226, 255, .18);
  opacity: calc(var(--live-sun-opacity) * .12);
  background: radial-gradient(circle at 38% 34%, rgba(255, 255, 255, .12), rgba(100, 201, 255, .035) 46%, transparent 72%);
  box-shadow: inset 0 0 18px rgba(255, 179, 210, .055);
  filter: blur(.4px);
  mix-blend-mode: screen;
}

.live-sun-ghost--near {
  width: clamp(20px, 2.6vw, 42px);
  aspect-ratio: 1;
  transform: translate(-50%, -50%) translate(64px, 48px);
}

.live-sun-ghost--far {
  width: clamp(11px, 1.5vw, 24px);
  aspect-ratio: 1;
  opacity: calc(var(--live-sun-opacity) * .17);
  transform: translate(-50%, -50%) translate(118px, 88px);
}

.live-sun-glow {
  width: clamp(130px, 15vw, 250px);
  aspect-ratio: 1;
  background: radial-gradient(circle,
    rgba(255, 255, 255, .58) 0 4%,
    rgba(239, 249, 255, .24) 18%,
    rgba(213, 237, 250, .09) 43%,
    transparent 73%);
  filter: blur(10px);
  mix-blend-mode: screen;
}

.live-sun-disc {
  width: clamp(20px, 2vw, 34px);
  aspect-ratio: 1;
}

.live-sun-disc img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  filter:
    blur(.45px)
    grayscale(1)
    saturate(0)
    brightness(1.58)
    contrast(.68)
    drop-shadow(0 0 5px rgba(255, 255, 248, .98))
    drop-shadow(0 0 13px rgba(255, 248, 214, .72))
    drop-shadow(0 0 27px rgba(255, 225, 167, .3));
  transition: filter 1.4s ease;
}

.live-sun-system--sunrise .live-sun-disc img,
.live-sun-system--golden-hour .live-sun-disc img {
  filter:
    grayscale(.48)
    sepia(.16)
    saturate(.62)
    brightness(1.25)
    drop-shadow(0 0 6px rgba(255, 248, 221, .94))
    drop-shadow(0 0 16px rgba(255, 205, 139, .6))
    drop-shadow(0 0 32px rgba(238, 145, 93, .3));
}

.live-sun-system--sunrise .live-sun-prism,
.live-sun-system--golden-hour .live-sun-prism {
  opacity: calc(var(--live-sun-opacity) * .2);
  filter: blur(7px) sepia(.25);
}

.live-sun-system--sunrise .live-sun-aura,
.live-sun-system--golden-hour .live-sun-aura {
  opacity: calc(var(--live-sun-opacity) * .62);
  filter: blur(20px) sepia(.2);
}

.live-sun-system.is-hidden .live-sun-glow,
.live-sun-system.is-hidden .live-sun-disc,
.live-sun-system.is-hidden .live-sun-aura,
.live-sun-system.is-hidden .live-sun-prism,
.live-sun-system.is-hidden .live-sun-ghost {
  opacity: 0;
}
</style>
