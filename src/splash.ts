// Animations de l'écran de lancement (GSAP). Chargé à part de l'application pour démarrer au plus tôt.
// Le contrôleur de progression est dans index.html ; ce module ajoute la mise en scène et la sortie.
import { gsap } from 'gsap';

const NS = 'http://www.w3.org/2000/svg';
const root = document.getElementById('splash');

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element): SVGElementTagNameMap[K] {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  parent.appendChild(n);
  return n;
}

// ---------- Carte en perspective (rues, mer, itinéraire, repères) ----------
const W = 600, H = 260, CX = 300, TOP = 18;
const sc = (v: number) => 1 / (1 + 2.4 * v);
const P = (u: number, v: number): [number, number] => [CX + u * 330 * sc(v), TOP + (H - TOP) * sc(v)];
const pt = (u: number, v: number) => P(u, v).map((n) => n.toFixed(1)).join(' ');

function buildMap(g: SVGGElement) {
  const defs = el('defs', {}, g);
  const glow = el('filter', { id: 'spMapGlow', x: '-50%', y: '-50%', width: '200%', height: '200%' }, defs);
  el('feGaussianBlur', { stdDeviation: 3, result: 'b' }, glow);
  const m = el('feMerge', {}, glow); el('feMergeNode', { in: 'b' }, m); el('feMergeNode', { in: 'SourceGraphic' }, m);
  const fade = el('linearGradient', { id: 'spMapFade', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  el('stop', { offset: 0, 'stop-color': '#0a1628', 'stop-opacity': 1 }, fade);
  el('stop', { offset: 0.35, 'stop-color': '#0a1628', 'stop-opacity': 0 }, fade);
  const pinG = el('radialGradient', { id: 'spMapPin', cx: 0.38, cy: 0.3, r: 0.8 }, defs);
  el('stop', { offset: 0, 'stop-color': '#6ff5e8' }, pinG); el('stop', { offset: 1, 'stop-color': '#0b8f88' }, pinG);

  // sol + mer
  el('path', { d: `M${pt(-40, 0)} L${pt(-40, 9)} L${pt(40, 9)} L${pt(40, 0)} Z`, fill: '#0c2038' }, g);
  el('path', { d: `M${pt(1.25, 0.25)} L${pt(1.05, 9)} L${pt(40, 9)} L${pt(40, 0)} L${pt(1.6, 0)} Z`, fill: '#0b2c4a' }, g);
  const streets = el('g', { stroke: '#2bd4c6', 'stroke-opacity': 0.22, 'stroke-width': 1.3, fill: 'none' }, g);
  for (let u = -12; u <= 1; u += 0.5) el('path', { d: `M${pt(u, 0)} L${pt(u, 9)}` }, streets);
  for (const v of [0.08, 0.2, 0.36, 0.56, 0.82, 1.2, 1.8, 2.8, 4.5]) el('path', { d: `M${pt(-40, v)} L${pt(1.2, v)}` }, streets);
  el('path', { d: `M${pt(-3, 0)} L${pt(0.6, 3)}`, 'stroke-opacity': 0.3 }, streets);
  el('path', { d: `M${pt(-1.6, 2)} Q${pt(-0.3, 0.6)} ${pt(1.15, 0.3)}`, 'stroke-opacity': 0.3 }, streets);
  // quai lumineux
  el('path', { d: `M${pt(1.6, 0)} L${pt(1.25, 0.25)} L${pt(1.05, 9)}`, stroke: '#2bd4c6', 'stroke-opacity': 0.5, 'stroke-width': 2, fill: 'none' }, g);
  // lampadaires
  for (const [u, v] of [[-2.2, 0.5], [-1.4, 0.9], [-0.6, 1.6], [0.5, 1.2], [1.0, 0.6], [-2.8, 1.4], [0.2, 2.6]]) {
    const [x, y] = P(u, v); el('circle', { cx: x, cy: y, r: 2.2 * sc(v) + 0.8, fill: '#ffd28a', 'fill-opacity': 0.8, filter: 'url(#spMapGlow)' }, g);
  }
  // itinéraire (dessiné progressivement)
  const way: [number, number][] = [[-0.25, 0.02], [-0.25, 0.2], [0.35, 0.2], [0.35, 0.36], [0.05, 0.56], [0.05, 0.64]];
  const route = el('path', { id: 'sp-route', d: 'M' + way.map(([u, v]) => pt(u, v)).join(' L'), stroke: '#22d3c5', 'stroke-width': 5, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', filter: 'url(#spMapGlow)' }, g);
  // point « vous êtes ici »
  const [mx, my] = P(-0.25, 0.02);
  el('circle', { id: 'sp-me-ring', cx: mx, cy: my, r: 10, fill: 'none', stroke: '#7ff5ea', 'stroke-width': 2 }, g);
  el('circle', { id: 'sp-me', cx: mx, cy: my, r: 6, fill: '#e6fffb', stroke: '#22d3c5', 'stroke-width': 3 }, g);

  // repères de pharmacies
  const pins: { u: number; v: number; s: number; id: string }[] = [
    { u: -1.35, v: 0.42, s: 0.75, id: 'sp-p1' },
    { u: 1.0, v: 0.95, s: 0.6, id: 'sp-p3' },
    { u: 0.05, v: 0.64, s: 1.15, id: 'sp-p2' },
  ];
  for (const p of pins) {
    const [x, y] = P(p.u, p.v);
    const grp = el('g', { id: p.id, transform: `translate(${x} ${y})` }, g);
    const k = p.s * 0.9;
    el('ellipse', { class: 'rip', cx: 0, cy: 0, rx: 26 * k, ry: 8 * k, fill: 'none', stroke: '#22d3c5', 'stroke-width': 2.4 }, grp);
    el('ellipse', { cx: 0, cy: 0, rx: 13 * k, ry: 4 * k, fill: '#22d3c5', 'fill-opacity': 0.55, filter: 'url(#spMapGlow)' }, grp);
    const pin = el('g', { class: 'pin', transform: `scale(${k})` }, grp);
    el('path', { d: 'M0 0C-6-10-22-22-22-38c0-13 10-23 22-23s22 10 22 23C22-22 6-10 0 0z', fill: 'url(#spMapPin)', filter: 'url(#spMapGlow)' }, pin);
    el('circle', { cx: 0, cy: -38, r: 14, fill: '#0b5f60', 'fill-opacity': 0.55 }, pin);
    el('path', { d: 'M-4-47h8v5h5v8h-5v5h-8v-5h-5v-8h5z', fill: '#fff' }, pin);
  }
  // fondus vers le ciel (haut) et vers le chargeur (bas)
  el('rect', { x: -2400, y: 0, width: W + 4800, height: H, fill: 'url(#spMapFade)' }, g);
  const bottom = el('linearGradient', { id: 'spMapBottom', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  el('stop', { offset: 0, 'stop-color': '#0a1628', 'stop-opacity': 0 }, bottom);
  el('stop', { offset: 1, 'stop-color': '#0a1628', 'stop-opacity': 1 }, bottom);
  el('rect', { x: -2400, y: H * 0.72, width: W + 4800, height: H * 0.29, fill: 'url(#spMapBottom)' }, g);
  return route;
}

function start() {
  if (!root) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  root.classList.add('gsap');
  const mapG = document.getElementById('sp-mapg') as SVGGElement | null;
  const route = mapG ? buildMap(mapG) : null;
  const q = <T extends Element = Element>(s: string) => root.querySelector<T>(s);
  const qa = (s: string) => Array.from(root.querySelectorAll(s));
  const intro = qa('.sp-in');
  gsap.set(intro, { opacity: 1 });

  if (reduce) return;

  const len = route ? route.getTotalLength() : 0;
  if (route) gsap.set(route, { strokeDasharray: len, strokeDashoffset: len });

  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
  tl.from('.sp-blob, .sp-arc', { opacity: 0, scale: 0.6, duration: 1.6, stagger: 0.15 }, 0)
    .from('.sp-stars', { opacity: 0, duration: 2 }, 0.2)
    .from('.sp-logo', { opacity: 0, duration: 0.4 }, 0.2)
    .from('#sp-tile', { opacity: 0, scale: 0.4, transformOrigin: '80px 148px', duration: 0.9, ease: 'back.out(2)' }, 0.25)
    .from('#sp-pin', { y: -70, opacity: 0, duration: 1.1, ease: 'bounce.out' }, 0.35)
    .from('#sp-orbit, #sp-orbit-back', { scale: 0.2, opacity: 0, transformOrigin: '80px 74px', duration: 1, ease: 'back.out(1.6)' }, 1.0)
    .from('.sp-title .w', { y: 34, opacity: 0, duration: 0.9, stagger: 0.18 }, 1.1)
    .from('.sp-maroc span', { scale: 0.6, opacity: 0, duration: 0.8, ease: 'back.out(2.2)' }, 1.5)
    .from('.sp-maroc i:first-child', { scaleX: 0, transformOrigin: '100% 50%', duration: 0.8 }, 1.6)
    .from('.sp-maroc i:last-child', { scaleX: 0, transformOrigin: '0% 50%', duration: 0.8 }, 1.65)
    .from('.sp-sub', { y: 16, opacity: 0, duration: 0.8 }, 1.9)
    .from('.sp-tower', { y: 50, opacity: 0, duration: 1.6, ease: 'power2.out' }, 1.5)
    .from('.sp-map', { opacity: 0, y: 30, duration: 1.2 }, 1.8)
    .from('#sp-me, #sp-me-ring', { scale: 0, transformOrigin: 'center', duration: 0.6, ease: 'back.out(3)' }, 2.4)
    .from('#sp-p1 .pin, #sp-p3 .pin', { y: -40, opacity: 0, duration: 0.8, ease: 'bounce.out', stagger: 0.2 }, 2.6);
  if (route) tl.to(route, { strokeDashoffset: 0, duration: 1.8, ease: 'power1.inOut' }, 2.8);
  tl.from('#sp-p2 .pin', { y: -60, scale: 0.4, opacity: 0, transformOrigin: '0 0', duration: 1, ease: 'elastic.out(1, 0.5)' }, 4.2)
    .from('.sp-city', { x: 40, opacity: 0, duration: 0.8 }, 3.0)
    .from('.sp-loader', { y: 30, opacity: 0, duration: 0.8 }, 1.4);

  // ---------- Boucles d'ambiance ----------
  gsap.to('#sp-pin', { y: -6, duration: 1.6, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 1.6 });
  // satellite qui parcourt l'anneau d'orbite (ellipse inclinée de -14°)
  const sat = q<SVGCircleElement>('#sp-sat');
  if (sat) {
    const o = { a: 0 };
    const rad = (-14 * Math.PI) / 180;
    gsap.to(o, {
      a: Math.PI * 2, duration: 3.2, ease: 'none', repeat: -1,
      onUpdate: () => {
        const ex = 66 * Math.cos(o.a), ey = 20 * Math.sin(o.a);
        sat.setAttribute('cx', String(80 + ex * Math.cos(rad) - ey * Math.sin(rad)));
        sat.setAttribute('cy', String(74 + ex * Math.sin(rad) + ey * Math.cos(rad)));
        sat.style.opacity = Math.sin(o.a) > -0.2 ? '1' : '0.25'; // passe derrière le repère
      },
    });
  }
  gsap.to('#sp-orbit', { strokeDashoffset: -314, duration: 6, ease: 'none', repeat: -1 });
  gsap.fromTo(qa('.rip'), { scale: 0.4, opacity: 0.9, transformOrigin: 'center' }, { scale: 1.9, opacity: 0, duration: 2, ease: 'power1.out', repeat: -1, stagger: 0.5, delay: 3 });
  gsap.fromTo('#sp-me-ring', { scale: 1, opacity: 0.9, transformOrigin: 'center' }, { scale: 2.6, opacity: 0, duration: 1.6, repeat: -1, ease: 'power1.out', delay: 2.6 });
  gsap.to('#sp-p2 .pin', { y: -5, duration: 1.2, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 5.2 });
  // croix du chargeur : battement de cœur
  gsap.timeline({ repeat: -1, repeatDelay: 0.5, delay: 2 })
    .to('#sp-cross', { scale: 1.22, duration: 0.14, ease: 'power2.out' })
    .to('#sp-cross', { scale: 1, duration: 0.2, ease: 'power2.in' })
    .to('#sp-cross', { scale: 1.14, duration: 0.12, ease: 'power2.out' })
    .to('#sp-cross', { scale: 1, duration: 0.3, ease: 'power2.in' });
  // villes couvertes, l'une après l'autre
  const city = document.getElementById('sp-cityname');
  if (city) {
    const names = ['Rabat', 'Salé', 'Témara'];
    let i = 0;
    gsap.timeline({ repeat: -1, delay: 4.6 })
      .to(city, { y: -14, opacity: 0, duration: 0.3, ease: 'power2.in', onComplete: () => { i = (i + 1) % names.length; city.textContent = names[i]; } })
      .fromTo(city, { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: 'power2.out' })
      .to({}, { duration: 1.4 });
  }
  // léger « respir » des halos
  gsap.to('.sp-blob', { scale: 1.08, duration: 4, ease: 'sine.inOut', yoyo: true, repeat: -1 });
}

(window as unknown as { __splashFx?: { progress: (p: number) => void; exit: (done: () => void) => void } }).__splashFx = {
  progress: () => {},
  exit: (done) => {
    if (!root) return done();
    gsap.timeline({ onComplete: done })
      .to('#sp-p2 .pin', { scale: 1.4, duration: 0.25, ease: 'power2.out' })
      .to(root.querySelectorAll('.sp-wrap > *'), { y: -24, opacity: 0, duration: 0.45, stagger: 0.05, ease: 'power2.in' }, 0.1)
      .to(root, { opacity: 0, duration: 0.45, ease: 'power1.in' }, 0.35);
  },
};

try { start(); } catch { root?.classList.remove('gsap'); }
