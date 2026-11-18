/*
  Black Den Motion — modalità 3D (v1.2)
  Skill creata da Den (Black Den) · IG @itsblackden · TikTok @itsblackden · YouTube @itsblackden

  Scena 3D vera (three.js, licenza MIT, in vendor/) sotto i testi HTML di motion.js:
  schede (screenshot, loghi, interfacce) che volano nello spazio, UNA luce principale con ombre morbide,
  camera su un'unica curva continua, profondità di campo che mette a fuoco quello che la camera guarda,
  bagliore leggero sulle parti chiare. Tutto dipende solo da t, come il resto della skill.

  Unità: pixel. Una scheda larga 600 a z = 0 occupa 600 px dello schermo con la camera di partenza.
*/
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const M = window.M;
const M3 = (window.M3 = { THREE });
const caricamenti = [];
const anim = [];
let R = null; // { renderer, scene, camera, composer, bokeh, D }
const rad = (g) => (g || 0) * Math.PI / 180;
const ease = (n) => (M.EASE[n || 'inOut'] || M.EASE.inOut);
// colori del brand: BRAND.colors.accent (formato di brand.js) o BRAND.accent
const B = () => { const b = window.BRAND || {}; return { ...b, ...(b.colors || {}) }; };

/* ---------- Scena ---------- */
// M3.init({ fov, bg, nebbia, luce: {da: [x,y,z], intensita, colore}, ambiente, fuoco: {apertura, sfocaturaMax} | false,
//           bagliore: {forza, raggio, soglia} | false, pavimento: true|false })
M3.init = (o = {}) => {
  const { width: W, height: H } = M.META;
  const fov = o.fov ?? 35;
  const D = (H / 2) / Math.tan(rad(fov / 2)); // distanza a cui 1 unità = 1 px
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: o.bg === null, preserveDrawingBuffer: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(W, H);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = o.esposizione ?? 1.25;
  const cv = renderer.domElement;
  Object.assign(cv.style, { position: 'absolute', left: 0, top: 0, width: W + 'px', height: H + 'px' });
  const stage = document.getElementById('stage');
  stage.insertBefore(cv, stage.firstChild);

  const scene = new THREE.Scene();
  const fondo = o.bg === null ? null : new THREE.Color(o.bg || B().bg || '#07070a');
  scene.background = fondo;
  if (fondo && o.nebbia !== false) scene.fog = new THREE.Fog(fondo, D * 0.9, D * 3.2);

  const camera = new THREE.PerspectiveCamera(fov, W / H, 10, D * 8);
  camera.position.set(0, 0, D);

  // UNA sola luce principale (il look cinematografico), più un riempimento debolissimo
  const l = o.luce || {};
  const key = new THREE.DirectionalLight(l.colore || '#ffffff', l.intensita ?? 2.6);
  key.position.set(...(l.da || [-0.6 * D, 0.9 * D, 0.8 * D]));
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -W, right: W, top: H, bottom: -H, near: 10, far: D * 4 });
  key.shadow.radius = 6;
  key.shadow.bias = -0.0004;
  scene.add(key, new THREE.AmbientLight('#ffffff', o.ambiente ?? 0.55));

  if (o.pavimento) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(W * 6, W * 6), new THREE.ShadowMaterial({ opacity: 0.35 }));
    p.rotation.x = -Math.PI / 2; p.position.y = -H * 0.42; p.receiveShadow = true; scene.add(p);
  }

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(window.devicePixelRatio || 1);
  composer.setSize(W, H);
  composer.addPass(new RenderPass(scene, camera));
  let bokeh = null;
  if (o.fuoco !== false) {
    const f = o.fuoco || {};
    bokeh = new BokehPass(scene, camera, { focus: D, aperture: f.apertura ?? 0.00012, maxblur: f.sfocaturaMax ?? 0.012 });
    composer.addPass(bokeh);
  }
  if (o.bagliore !== false) {
    const g = o.bagliore || {};
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), g.forza ?? 0.35, g.raggio ?? 0.5, g.soglia ?? 0.82));
  }
  composer.addPass(new OutputPass());
  R = { renderer, scene, camera, composer, bokeh, D, fov };
  M3.D = D;
  return R;
};

/* ---------- Texture ---------- */
const carica = (src) => {
  const tex = new THREE.TextureLoader().load(src);
  caricamenti.push(new Promise((ok) => { const img = new Image(); img.onload = img.onerror = ok; img.src = src; }));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
};

// Interfaccia di esempio disegnata (quando non c'è uno screenshot vero): 'chat' | 'lista' | 'grafico' | 'profilo'
M3.ui = (tipo = 'lista', { w = 600, h = 420, colori } = {}) => {
  const c = document.createElement('canvas');
  const k = 2; c.width = w * k; c.height = h * k;
  const x = c.getContext('2d'); x.scale(k, k);
  const acc = (colori && colori[0]) || B().accent || '#2EE6D6', acc2 = (colori && colori[1]) || B().accent2 || '#FF4D6D';
  x.fillStyle = B().panel || '#15161b'; x.fillRect(0, 0, w, h);
  x.fillStyle = 'rgba(255,255,255,0.06)'; x.fillRect(0, 0, w, 54);
  ['#ff5f57', '#febc2e', '#28c840'].forEach((col, i) => { x.fillStyle = col; x.beginPath(); x.arc(28 + i * 22, 27, 7, 0, 7); x.fill(); });
  const riga = (yy, ww, op = 0.18) => { x.fillStyle = `rgba(255,255,255,${op})`; x.beginPath(); x.roundRect(32, yy, ww, 14, 7); x.fill(); };
  if (tipo === 'grafico') {
    const g = x.createLinearGradient(0, 90, 0, h - 30); g.addColorStop(0, acc); g.addColorStop(1, 'rgba(0,0,0,0)');
    const ys = [0.75, 0.62, 0.68, 0.45, 0.5, 0.3, 0.22, 0.12].map((v) => 90 + v * (h - 130));
    x.beginPath(); x.moveTo(32, h - 30); ys.forEach((y, i) => x.lineTo(32 + i * ((w - 64) / 7), y)); x.lineTo(w - 32, h - 30); x.fillStyle = g; x.globalAlpha = 0.5; x.fill(); x.globalAlpha = 1;
    x.beginPath(); ys.forEach((y, i) => (i ? x.lineTo : x.moveTo).call(x, 32 + i * ((w - 64) / 7), y)); x.strokeStyle = acc; x.lineWidth = 5; x.stroke();
  } else if (tipo === 'chat') {
    x.fillStyle = 'rgba(255,255,255,0.1)'; x.beginPath(); x.roundRect(w * 0.38, 84, w * 0.55, 56, 18); x.fill();
    x.fillStyle = acc; x.beginPath(); x.arc(46, 186, 14, 0, 7); x.fill();
    riga(170, w * 0.6, 0.28); riga(196, w * 0.7); riga(222, w * 0.5);
    x.fillStyle = 'rgba(255,255,255,0.08)'; x.beginPath(); x.roundRect(24, h - 78, w - 48, 52, 26); x.fill();
    x.fillStyle = acc; x.beginPath(); x.arc(w - 52, h - 52, 18, 0, 7); x.fill();
  } else {
    for (let i = 0; i < 4; i++) {
      const yy = 84 + i * ((h - 110) / 4);
      x.fillStyle = i === 0 ? acc : i === 1 ? acc2 : 'rgba(255,255,255,0.12)';
      x.beginPath(); x.roundRect(32, yy, 54, 54, 14); x.fill();
      riga(yy + 8, w * 0.5, 0.3); riga(yy + 32, w * 0.35);
    }
  }
  return c.toDataURL('image/png');
};

/* ---------- Schede ---------- */
const forma = (w, h, r) => {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
};
const uvNormali = (g, w, h) => {
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + w / 2) / w, (p.getY(i) + h / 2) / h);
  uv.needsUpdate = true;
};

// M3.card({ src | ui, w, h, r, spessore, x, y, z, rx, ry, rz, s, trasparente, colore })
// Una scheda con angoli arrotondati e un po' di spessore: screenshot, logo (trasparente: true) o interfaccia di esempio.
M3.card = (o = {}) => {
  const w = o.w ?? 600, h = o.h ?? 400, r = Math.min(o.r ?? 34, w / 2, h / 2), sp = o.spessore ?? (o.trasparente ? 0 : 12);
  const g = new THREE.Group();
  const geo = new THREE.ShapeGeometry(forma(w, h, r), 24); uvNormali(geo, w, h);
  const src = o.src || (o.ui ? M3.ui(o.ui, { w, h }) : null);
  const mat = new THREE.MeshStandardMaterial({ color: src ? '#ffffff' : (o.colore || B().panel || '#1b1c22'), map: src ? carica(src) : null,
    roughness: 0.42, metalness: 0.05, transparent: true, alphaTest: o.trasparente ? 0.02 : 0 });
  const fronte = new THREE.Mesh(geo, mat); fronte.position.z = 0.6; fronte.castShadow = !o.trasparente; g.add(fronte);
  if (sp > 0) {
    const corpo = new THREE.Mesh(new THREE.ExtrudeGeometry(forma(w, h, r), { depth: sp, bevelEnabled: true, bevelThickness: 2, bevelSize: 2, bevelSegments: 3, curveSegments: 24 }),
      new THREE.MeshStandardMaterial({ color: o.bordo || '#0d0e12', roughness: 0.35, metalness: 0.35, transparent: true }));
    corpo.position.z = -sp - 2.5; corpo.castShadow = true; g.add(corpo); // lo smusso (2 px) resta dietro la faccia
  }
  // riflesso: banda di luce che attraversa la scheda (M3.riflesso)
  const shine = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { p: { value: -1 }, forza: { value: 0.32 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec2 vUv; uniform float p; uniform float forza; void main(){ float d = abs(vUv.x + vUv.y*0.35 - p); float a = smoothstep(0.045, 0.0, d) * forza; gl_FragColor = vec4(vec3(1.0), a); }',
  }));
  shine.position.z = 1.2; g.add(shine);
  g.userData = { fronte, shine, materiali: g.children.map((m) => m.material) };
  g.position.set(o.x || 0, o.y || 0, o.z || 0);
  g.rotation.set(rad(o.rx), rad(o.ry), rad(o.rz));
  g.scale.setScalar(o.s ?? 1);
  R.scene.add(g);
  return g;
};

/* ---------- Animazione ---------- */
// M3.anim(oggetto, [{ t, x, y, z, rx, ry, rz, s, o, ease }]) — come i keyframe di motion.js; ease vale per il tratto che arriva lì.
const CHIAVI = ['x', 'y', 'z', 'rx', 'ry', 'rz', 's', 'o'];
M3.anim = (obj, keys) => {
  const k = [...keys].sort((a, b) => a.t - b.t);
  const val = (p, T) => {
    const con = k.filter((q) => q[p] != null);
    if (!con.length) return null;
    if (T <= con[0].t) return con[0][p];
    for (let i = 1; i < con.length; i++) if (T < con[i].t) {
      const a = con[i - 1], b = con[i], u = ease(b.ease)((T - a.t) / (b.t - a.t));
      return a[p] + (b[p] - a[p]) * u;
    }
    return con[con.length - 1][p];
  };
  anim.push((T) => {
    for (const p of CHIAVI) {
      const v = val(p, T);
      if (v == null) continue;
      if (p === 'x' || p === 'y' || p === 'z') obj.position[p] = v;
      else if (p === 's') obj.scale.setScalar(v);
      else if (p === 'o') (obj.userData.materiali || []).forEach((m) => { if (m.uniforms) m.uniforms.forza.value = 0.32 * v; else m.opacity = v; });
      else obj.rotation[p[1]] = rad(v);
    }
  });
};

// M3.riflesso(scheda, t, dur): la luce passa sulla scheda una volta (con il suono shimmer di motion.js)
M3.riflesso = (card, t, dur = 0.7) => {
  anim.push((T) => { card.userData.shine.material.uniforms.p.value = -0.4 + 1.8 * Math.min(1, Math.max(0, (T - t) / dur)) - (T < t ? 1 : 0); });
  if (M.sfx) M.sfx(t, 'shimmer', { gain: 0.5 });
};

// M3.camera([{ pos: [x,y,z], guarda: [x,y,z] }, …], { da, a, ease, fuoco })
// UNA curva continua che passa da tutti i punti (Catmull-Rom), percorsa a velocità uniforme con un solo easing:
// niente cambi di direzione bruschi, niente "zoom avanti e poi indietro". La messa a fuoco segue il punto guardato.
M3.camera = (punti, { da = 0, a = M.META.duration, ease: e = 'inOut', tensione = 0.5 } = {}) => {
  const pos = new THREE.CatmullRomCurve3(punti.map((p) => new THREE.Vector3(...p.pos)), false, 'catmullrom', tensione);
  const look = new THREE.CatmullRomCurve3(punti.map((p) => new THREE.Vector3(...(p.guarda || [0, 0, 0]))), false, 'catmullrom', tensione);
  anim.push((T) => {
    const u = ease(e)(Math.min(1, Math.max(0, (T - da) / (a - da))));
    const P = pos.getPointAt(u), L = look.getPointAt(u);
    R.camera.position.copy(P); R.camera.lookAt(L);
    if (R.bokeh) R.bokeh.uniforms.focus.value = P.distanceTo(L);
  });
};

// M3.oscilla(oggetto, {ampiezza, velocita}): un movimento minimo continuo, così niente sta mai fermo.
// Si somma alle animazioni (viene tolto e rimesso a ogni fotogramma: il risultato dipende solo da t).
const oscilla = [];
M3.oscilla = (obj, { ampiezza = 6, velocita = 0.6, fase = 0 } = {}) => {
  const st = { dy: 0, dry: 0 };
  oscilla.push({
    togli: () => { obj.position.y -= st.dy; obj.rotation.y -= st.dry; st.dy = st.dry = 0; },
    metti: (T) => { st.dy = Math.sin(T * velocita * 2 + fase) * ampiezza; st.dry = rad(Math.sin(T * velocita + fase) * ampiezza * 0.4); obj.position.y += st.dy; obj.rotation.y += st.dry; },
  });
};

/* ---------- Avvio ---------- */
// Va chiamato al posto di M.boot(). Il 3D riceve il tempo vero di ogni sotto-fotogramma: con --mblur anche la
// camera e le schede hanno il motion blur reale. Il render aspetta che tutte le texture siano caricate.
M3.boot = () => {
  const seek = M.seek;
  M.seek = (t, tf = t) => {
    seek(t, tf);
    for (const o of oscilla) o.togli();
    for (const f of anim) f(t);
    for (const o of oscilla) o.metti(t);
    R.composer.render();
  };
  M.boot();
  const prima = window.__ready;
  window.__ready = Promise.all([prima, ...caricamenti]).then(() => { M.seek(0); return true; });
};
