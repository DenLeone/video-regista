// Scena fatta a mano (Claude, 19/11) per il video «Skill»: l'esempio che Denis dice a voce
// «trasforma il logo di Spotify in un vinile che gira sopra un giradischi di vetro mentre esce dal vinile un album».
// Fascia trasparente sopra la testa (Black Den Motion 3D). Si usa con «Animazione: skill-vinile» nel brief.
// Storyboard: 1) il logo Spotify entra davanti a noi  2) si ribalta e DIVENTA l'etichetta di un vinile che si allarga
// 3) sotto compare il giradischi di vetro, il vinile gira, il braccio si appoggia  4) dal vinile sale l'album.
// La camera fa una sola curva: da davanti a tre quarti dall'alto.
// parola: vinile
// anticipo: 0.5
// durata: 6
const T3 = M3.THREE, S = M3.R.scene, D = M3.D, DUR = M.META.duration;
const k = Math.max(0.85, DUR / 4); // i tempi si allungano un po' se lo spazio è più lungo
const t = (s) => +(s * k).toFixed(3);
const rad = (g) => g * Math.PI / 180;
const VERDE = '#1DB954';

// icona Spotify (tracciato SVG della libreria di Denis, 24×24): cerchio con le tre onde vuote
const ICONA = new Path2D('M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z');
const tela = (n, disegna) => { const c = document.createElement('canvas'); c.width = c.height = n; disegna(c.getContext('2d'), n); const tx = new T3.CanvasTexture(c); tx.colorSpace = T3.SRGBColorSpace; tx.anisotropy = 8; return tx; };

// --- etichetta = logo Spotify (verde, onde nere), poi centro del vinile ---
const texLogo = tela(512, (x, n) => { x.fillStyle = '#000'; x.beginPath(); x.arc(n / 2, n / 2, n / 2, 0, 7); x.fill(); x.save(); x.translate(n * 0.06, n * 0.06); x.scale(n * 0.88 / 24, n * 0.88 / 24); x.fillStyle = VERDE; x.fill(ICONA); x.restore(); });
// --- solchi del vinile ---
const texVinile = tela(1024, (x, n) => {
  const c = n / 2; x.fillStyle = '#060607'; x.beginPath(); x.arc(c, c, c, 0, 7); x.fill();
  for (let r = c * 0.36; r < c * 0.97; r += 2.2) { const v = 14 + ((r * 7.3) % 9); x.strokeStyle = `rgb(${v},${v},${v + 2})`; x.lineWidth = 1.1; x.beginPath(); x.arc(c, c, r, 0, 7); x.stroke(); }
  for (const r of [c * 0.55, c * 0.72, c * 0.86]) { x.strokeStyle = '#000'; x.lineWidth = 5; x.beginPath(); x.arc(c, c, r, 0, 7); x.stroke(); } // pause tra le tracce
  x.strokeStyle = '#2a2a2e'; x.lineWidth = 6; x.beginPath(); x.arc(c, c, c * 0.985, 0, 7); x.stroke();
});
// --- riflesso fisso sul vinile (non gira: è la luce della stanza) ---
const texLuce = tela(512, (x, n) => {
  const c = n / 2, g = x.createConicGradient(rad(-30), c, c);
  // due strisce morbide e sottili, come la luce del neon sulla plastica lucida
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.05, 'rgba(255,170,240,0.32)'); g.addColorStop(0.085, 'rgba(255,255,255,0.12)'); g.addColorStop(0.13, 'rgba(255,255,255,0)');
  g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(0.545, 'rgba(255,190,120,0.26)'); g.addColorStop(0.59, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.beginPath(); x.arc(c, c, c, 0, 7); x.arc(c, c, c * 0.36, 0, 7, true); x.fill();
});
// --- copertina dell'album ---
const texAlbum = tela(768, (x, n) => {
  const g = x.createLinearGradient(0, 0, n, n); g.addColorStop(0, '#2a0d3a'); g.addColorStop(0.55, '#0c0a12'); g.addColorStop(1, '#03140a');
  x.fillStyle = g; x.fillRect(0, 0, n, n);
  for (let i = 0; i < 9; i++) { x.strokeStyle = `rgba(29,185,84,${0.75 - i * 0.075})`; x.lineWidth = 7; x.beginPath(); x.arc(n * 0.72, n * 0.7, 60 + i * 34, 0, 7); x.stroke(); }
  x.fillStyle = VERDE; x.beginPath(); x.arc(n * 0.72, n * 0.7, 46, 0, 7); x.fill();
  x.fillStyle = '#fff'; x.font = `900 ${n * 0.15}px Inter, "Liberation Sans", Arial, sans-serif`; x.textBaseline = 'top';
  x.fillText('MOTION', n * 0.08, n * 0.08); x.fillStyle = 'rgba(255,255,255,0.75)'; x.font = `700 ${n * 0.045}px Inter, "Liberation Sans", Arial, sans-serif`;
  x.fillText('VOL. 1 · MADE WITH CLAUDE', n * 0.085, n * 0.25);
});

// --- materiali e oggetti ---
const R_VIN = 225, R_LAB = 78, Y_PIATTO = -30;
const vetro = new T3.MeshPhysicalMaterial({ color: '#d9ecff', roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, transparent: true, opacity: 0.2, side: T3.DoubleSide, depthWrite: false });
const bordoVetro = (geo, op = 0.75) => new T3.LineSegments(new T3.EdgesGeometry(geo, 25), new T3.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: op }));

const giradischi = new T3.Group(); S.add(giradischi);
const geoBase = new T3.BoxGeometry(640, 34, 470);
const base = new T3.Mesh(geoBase, vetro); giradischi.add(base, bordoVetro(geoBase));
const geoPiatto = new T3.CylinderGeometry(R_VIN + 14, R_VIN + 14, 10, 96);
const piatto = new T3.Mesh(geoPiatto, vetro); piatto.position.y = 22; const bordoPiatto = bordoVetro(geoPiatto, 0.5); bordoPiatto.position.y = 22; giradischi.add(piatto, bordoPiatto);
// braccio: perno + asta + testina (metallo chiaro)
const metallo = new T3.MeshStandardMaterial({ color: '#e8e8ee', roughness: 0.25, metalness: 0.9 });
// perno in alto a destra; la testina finisce sui solchi esterni (a ~160 px dal centro), mai sull'etichetta
const braccio = new T3.Group(); braccio.position.set(250, 26, -150); giradischi.add(braccio);
braccio.add(new T3.Mesh(new T3.CylinderGeometry(16, 20, 30, 32), metallo));
const verso = new T3.Group(); verso.rotation.y = rad(63.6); braccio.add(verso); // asse -x locale → verso la testina
const asta = new T3.Mesh(new T3.CylinderGeometry(4, 4, 290, 16), metallo); asta.rotation.z = rad(90); asta.position.set(-145, 22, 0); verso.add(asta);
const testina = new T3.Mesh(new T3.BoxGeometry(36, 12, 22), metallo); testina.position.set(-290, 14, 0); verso.add(testina);
giradischi.position.y = Y_PIATTO - 40;

// vinile (disco sottile) con l'etichetta-logo sopra; gira tutto insieme
const vinile = new T3.Group(); S.add(vinile);
const disco = new T3.Mesh(new T3.CylinderGeometry(R_VIN, R_VIN, 4, 128), [
  new T3.MeshStandardMaterial({ color: '#0a0a0c', roughness: 0.4, metalness: 0.3 }),
  new T3.MeshStandardMaterial({ map: texVinile, roughness: 0.32, metalness: 0.45 }),
  new T3.MeshStandardMaterial({ color: '#050506', roughness: 0.5 })]);
vinile.add(disco);
const luce = new T3.Mesh(new T3.CircleGeometry(R_VIN, 96), new T3.MeshBasicMaterial({ map: texLuce, transparent: true, blending: T3.AdditiveBlending, depthWrite: false }));
luce.rotation.x = rad(-90); luce.position.y = 2.6; S.add(luce); // fuori dal gruppo: non gira

// il logo: all'inizio sta in piedi davanti a noi, poi si sdraia e diventa l'etichetta
const logo = new T3.Mesh(new T3.CircleGeometry(140, 96), new T3.MeshStandardMaterial({ map: texLogo, roughness: 0.35, metalness: 0.1, transparent: true }));
S.add(logo);
// album: una copertina con spessore che sale dal vinile
const album = M3.card({ src: texAlbum.image.toDataURL('image/png'), w: 300, h: 300, r: 8, spessore: 6, y: Y_PIATTO, s: 0.01 });

// luci al neon come la stanza di Denis (rosa a sinistra, arancio a destra)
const rosa = new T3.PointLight('#ff2bd6', 3.2, 0, 0); rosa.position.set(-520, 260, 220);
const arancio = new T3.PointLight('#ff6a13', 2.4, 0, 0); arancio.position.set(520, 180, 260);
S.add(rosa, arancio);

// --- tempi ---
const A = { entra: 0, giu: t(0.42), atterra: t(1.2), braccio: t(1.35), album: t(1.75), albumSu: t(2.75) };

// logo: pop davanti, poi si ribalta e scende al centro del piatto rimpicciolendo fino all'etichetta
add({ fn: (T) => {
  const e = M.EASE, c = (a, b) => Math.min(1, Math.max(0, (T - a) / (b - a)));
  const p0 = e.back(c(A.entra, A.giu)), p1 = e.inOut(c(A.giu, A.atterra));
  logo.scale.setScalar(Math.max(0.001, p0 * (1 - p1 * (1 - R_LAB / 140))));
  logo.position.set(0, 60 + (Y_PIATTO + 3.5 - 60) * p1, 260 * (1 - p1));
  logo.rotation.set(rad(-90 * p1), 0, 0);
  // il vinile si allarga da sotto il logo mentre questo si sdraia
  const pv = e.expoOut(c(t(0.75), A.atterra + t(0.15)));
  vinile.scale.setScalar(Math.max(0.001, pv)); vinile.position.y = Y_PIATTO; luce.position.y = Y_PIATTO + 2.6; luce.scale.setScalar(Math.max(0.001, pv));
  luce.material.opacity = pv;
  // il vinile gira (e il logo con lui quando è etichetta): ~45 giri al minuto, sempre nello stesso verso
  const giro = -Math.max(0, T - t(0.75)) * Math.PI * 1.5;
  vinile.rotation.y = giro; if (p1 >= 1) logo.rotation.set(rad(-90), 0, 0), logo.rotateZ(giro);
  // giradischi di vetro: sale dal basso e si accende
  const pg = e.expoOut(c(t(0.6), t(1.25)));
  giradischi.position.y = Y_PIATTO - 40 - 80 * (1 - pg); vetro.opacity = 0.2 * pg;
  giradischi.children.forEach((o) => { if (o.isLineSegments) o.material.opacity = 0.75 * pg; });
  metallo.opacity = pg; metallo.transparent = true;
  // braccio che si appoggia sul disco
  braccio.rotation.y = rad(28 * (1 - e.inOut(c(A.braccio, A.braccio + t(0.45)))));
} });

// album: sale dal vinile, si raddrizza verso di noi, si sposta in alto a destra e resta sospeso
const xa = 250, ya = 170, za = 60;
M3.anim(album, [
  { t: A.album, x: 0, y: Y_PIATTO + 8, z: 0, rx: -90, ry: 0, rz: 0, s: 0.3 },
  { t: A.albumSu, x: xa, y: ya, z: za, rx: -8, ry: -24, rz: 4, s: 1, ease: 'expoOut' },
  { t: DUR, x: xa + 10, y: ya + 12, z: za + 20, rx: -6, ry: -30, rz: 4, s: 1.03, ease: 'linear' },
]);
M3.riflesso(album, A.albumSu - t(0.1), 0.8);

// una sola camera: da davanti (il logo) a tre quarti dall'alto (il giradischi), poi una deriva lenta
M3.camera([
  { pos: [0, 40, D * 1.0], guarda: [0, 40, 0] },
  { pos: [-60, D * 0.42, D * 0.95], guarda: [0, -10, 0] },
  { pos: [-110, D * 0.58, D * 0.9], guarda: [40, -10, 0] },
], { da: t(0.35), a: DUR, ease: 'out' });

// suoni: entrata, trasformazione, atterraggio, braccio, album
M.sfx(0, 'whoosh', { gain: 0.55 });
M.sfx(A.entra + 0.08, 'pop', { gain: 0.5 });
M.sfx(A.giu, 'riser', { gain: 0.35 });
M.sfx(A.atterra, 'impact', { gain: 0.6 });
M.sfx(A.braccio + t(0.4), 'click', { gain: 0.5 });
M.sfx(A.album, 'swipe', { gain: 0.5 });
