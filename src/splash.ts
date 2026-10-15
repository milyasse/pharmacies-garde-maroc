// Animations de l'écran de lancement (GSAP), superposées au visuel fourni (affiché tel quel).
// Coordonnées = pixels du visuel d'origine (941 × 1672). Le contrôleur de progression est dans index.html.
import { gsap } from 'gsap';

const root = document.getElementById('splash');
const $ = (s: string) => (root ? Array.from(root.querySelectorAll(s)) : []);
const TEAL = '#22f0e0', DOT_OFF = '#074e6f', DOT_DONE = '#0fbfb2';

function setDots(i: number) {
  $('#sp-dots .d').forEach((d, k) => {
    gsap.to(d, {
      attr: { r: k === i ? 10 : 8.5, fill: k < i || i >= 3 ? DOT_DONE : k === i ? TEAL : DOT_OFF },
      duration: 0.45, ease: 'back.out(3)',
    });
  });
}

function start() {
  if (!root) return;
  root.classList.add('gsap');
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  // roue de chargement : rotation continue + arc qui « respire »
  gsap.to('#sp-spin', { rotation: 360, svgOrigin: '472 1452', duration: 1.1, ease: 'none', repeat: -1 });
  if (!reduce) gsap.to('#sp-spin', { attr: { 'stroke-dasharray': '120 100' }, duration: 0.9, ease: 'sine.inOut', yoyo: true, repeat: -1 });
  setDots(0);
  if (reduce) return;

  // entrée : léger zoom du visuel
  gsap.from('.sp-art img', { scale: 1.06, opacity: 0, duration: 1.4, ease: 'power2.out' });

  // logo : halo qui pulse, reflet qui balaie, étincelle qui suit l'anneau d'orbite
  gsap.fromTo('#sp-logo-glow', { opacity: 0, attr: { r: 150 } }, { opacity: 0.85, attr: { r: 200 }, duration: 1.6, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 0.6 });
  gsap.timeline({ repeat: -1, repeatDelay: 2.2, delay: 1.2 })
    .set('#sp-shine', { opacity: 1, attr: { x: 250 } })
    .to('#sp-shine', { attr: { x: 640 }, duration: 0.9, ease: 'power2.inOut' })
    .set('#sp-shine', { opacity: 0 });
  const sat = root.querySelector<SVGCircleElement>('#sp-sat');
  if (sat) {
    const o = { a: 0 };
    const rot = (-22 * Math.PI) / 180, cx = 470, cy = 288, rx = 136, ry = 36;
    gsap.set(sat, { opacity: 1 });
    gsap.to(o, {
      a: Math.PI * 2, duration: 3.4, ease: 'none', repeat: -1,
      onUpdate: () => {
        const ex = rx * Math.cos(o.a), ey = ry * Math.sin(o.a);
        sat.setAttribute('cx', String(cx + ex * Math.cos(rot) - ey * Math.sin(rot)));
        sat.setAttribute('cy', String(cy + ex * Math.sin(rot) + ey * Math.cos(rot)));
        sat.setAttribute('opacity', Math.sin(o.a) > -0.15 ? '1' : '0.15'); // passe derrière le repère
      },
    });
  }

  // carte : ondes sous les repères, halo des repères
  gsap.fromTo('.r-main', { opacity: 0.95, scale: 0.55, svgOrigin: '470 1212' }, { opacity: 0, scale: 2.1, duration: 2.2, ease: 'power1.out', repeat: -1, stagger: 1.1 });
  $('.r-side').forEach((e, k) => {
    const cx = Number(e.getAttribute('cx')), cy = Number(e.getAttribute('cy'));
    gsap.fromTo(e, { opacity: 0.9, scale: 0.6, svgOrigin: `${cx} ${cy}` }, { opacity: 0, scale: 2.4, duration: 2, ease: 'power1.out', repeat: -1, delay: 0.6 + k * 0.7 });
  });
  gsap.fromTo('#sp-main-glow', { opacity: 0.2 }, { opacity: 0.85, duration: 1.1, ease: 'sine.inOut', yoyo: true, repeat: -1 });
  gsap.fromTo('.sp-side-glow', { opacity: 0 }, { opacity: 0.6, duration: 1.3, ease: 'sine.inOut', yoyo: true, repeat: -1, stagger: 0.65 });
  gsap.fromTo('#sp-tag-glow', { opacity: 0 }, { opacity: 0.55, duration: 1.5, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 0.8 });

  // lumières de la ville qui scintillent
  $('#sp-twinkles circle').forEach((c) => {
    gsap.to(c, { opacity: () => gsap.utils.random(0.5, 1), duration: () => gsap.utils.random(0.4, 0.9), yoyo: true, repeat: -1, repeatRefresh: true, delay: gsap.utils.random(0, 2.5), ease: 'sine.inOut' });
  });
}

(window as unknown as { __splashFx?: { step: (i: number) => void; exit: (done: () => void) => void } }).__splashFx = {
  step: setDots,
  exit: (done) => {
    if (!root) return done();
    gsap.timeline({ onComplete: done })
      .to('#sp-main-glow', { opacity: 1, attr: { r: 220 }, duration: 0.35, ease: 'power2.out' })
      .to('.sp-art', { scale: 1.06, duration: 0.6, ease: 'power2.in' }, 0.1)
      .to(root, { opacity: 0, duration: 0.5, ease: 'power1.in' }, 0.2);
  },
};

try {
  start();
  const w = window as unknown as { __splash?: { current?: () => number } };
  setDots(w.__splash?.current?.() ?? 0);
} catch {
  root?.classList.remove('gsap');
}
