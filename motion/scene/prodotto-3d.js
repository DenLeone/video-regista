// Scena fatta a mano (Claude, 19/11), riutilizzabile per ogni recensione: il momento «premium» del prodotto.
// Si usa con «Animazione: prodotto-3d» nel brief. Parte quando Denis dice per la prima volta il nome del prodotto.
// Storyboard: 1) la foto vera del prodotto arriva dal fondo girando e si raddrizza davanti a noi, su un alone del
// colore del brand  2) una luce la attraversa, sotto compare il nome  3) la scheda continua a girare piano,
// la camera si avvicina. Niente testi inventati: solo il nome (DATI.titolo) e la foto (DATI.foto[0]).
// parola: {prodotto}
// anticipo: 0.2
// durata: 4.5
const T3 = M3.THREE, S = M3.R.scene, DUR = M.META.duration;
const foto = (DATI.foto || [])[0] || null;
const nome = String(DATI.titolo || '').trim().toUpperCase();
const ACC = (window.BRAND?.colors?.accent) || '#FF6A13';

// alone dietro la scheda: un disco sfumato del colore del brand (si somma alla luce del video)
const alone = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d');
  const g = x.createRadialGradient(256, 256, 0, 256, 256, 256);
  g.addColorStop(0, ACC + 'aa'); g.addColorStop(0.45, ACC + '33'); g.addColorStop(1, ACC + '00');
  x.fillStyle = g; x.fillRect(0, 0, 512, 512);
  const tx = new T3.CanvasTexture(c); tx.colorSpace = T3.SRGBColorSpace;
  const m = new T3.Mesh(new T3.PlaneGeometry(760, 760), new T3.MeshBasicMaterial({ map: tx, transparent: true, blending: T3.AdditiveBlending, depthWrite: false }));
  m.position.set(0, 85, -140); S.add(m); return m;
})();

// la scheda con la foto vera (ritagliata al centro, senza deformarla); senza foto, l'interfaccia di esempio
const scheda = M3.card({ ...(foto ? { src: foto, adatta: true } : { ui: 'grafico' }), w: 360, h: 360, r: 36, spessore: 14, y: 85 });
M3.anim(scheda, [
  { t: 0, z: -1300, ry: 70, rx: 12, s: 0.9 },
  { t: 0.75, z: 0, ry: -8, rx: 0, s: 1, ease: 'expoOut' },
  { t: DUR, z: 40, ry: 10, rx: -3, s: 1.04, ease: 'linear' },
]);
M3.oscilla(scheda, { ampiezza: 5, velocita: 0.5 });
M3.riflesso(scheda, 0.85, 0.8);
add({ fn: (t) => { const p = Math.min(1, Math.max(0, t / 0.8)); alone.material.opacity = M.EASE.out(p); alone.scale.setScalar(0.6 + 0.4 * M.EASE.expoOut(p)); } });

// camera: una spinta lenta, sempre nello stesso verso
M3.camera([
  { pos: [0, 30, M3.D * 1.04], guarda: [0, 40, 0] },
  { pos: [30, 45, M3.D * 0.94], guarda: [0, 45, 0] },
], { da: 0, a: DUR, ease: 'inOut' });

// il nome sotto la scheda: grande se è corto, più piccolo se è lungo (entra sempre nella fascia)
if (nome) {
  const size = nome.length <= 12 ? 84 : nome.length <= 18 ? 64 : nome.length <= 26 ? 48 : 38;
  M.el('div', { id: 'nome', cls: 'abs row', text: nome, style: { top: `${650 - size}px`, fontSize: `${size}px`, fontWeight: 900, letterSpacing: '2px' } });
  add(P.lettersIn('#nome', { t: 1.0, step: 0.03, from: 'blur' }));
}

M.sfx(0, 'whoosh', { gain: 0.55 });
M.sfx(0.72, 'impact', { gain: 0.45 });
