// BlackDen Motion · motore: attrezzi comuni per animazioni su canvas 2D.
// Tutto è una funzione del tempo t (secondi): la stessa t dà sempre lo stesso fotogramma, quindi il render è preciso.
(function () {
  const M = {};
  M.clamp = (v) => Math.max(0, Math.min(1, v));
  M.lerp = (a, b, k) => a + (b - a) * k;
  M.prog = (t, a, b) => M.clamp((t - a) / (b - a));                       // 0→1 fra a e b
  // curve di movimento: "out" = parte veloce e arriva morbido (entrate), "in" = parte lento (uscite)
  M.outCubic = (k) => 1 - Math.pow(1 - M.clamp(k), 3);
  M.outExpo = (k) => ((k = M.clamp(k)) >= 1 ? 1 : 1 - Math.pow(2, -10 * k));
  M.inCubic = (k) => Math.pow(M.clamp(k), 3);
  M.inOut = (k) => { k = M.clamp(k); return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; };
  M.sine = (k) => 0.5 - 0.5 * Math.cos(Math.PI * M.clamp(k));

  // crea il canvas alla risoluzione giusta (?scala=2 → 4K) e restituisce { cv, ctx, W, H, S }
  M.tela = (W, H) => {
    const q = new URLSearchParams(location.search), S = parseFloat(q.get('scala') || q.get('scale') || '1');
    const cv = document.getElementById('c'); cv.width = W * S; cv.height = H * S;
    return { cv, ctx: cv.getContext('2d'), W, H, S, q };
  };
  // fondo scuro con una sola luce morbida (posizione in frazioni dello schermo)
  // sovrapposizione a un video (✨ Ultron): niente fondo né grana, solo un velo scuro morbido dietro la grafica
  M.trasparente = () => Boolean(window.PARAMS && window.PARAMS.trasparente);
  M.fondo = (g, cv, { x = 0.5, y = 0.4, centro = '#1a1a1f', bordo = '#030304', forza = 1 } = {}) => {
    if (M.trasparente()) {
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
      const cy = cv.height * (window.BASE ? window.BASE.CY / window.BASE.H : 0.2), r = g.createRadialGradient(cv.width / 2, cy, 0, cv.width / 2, cy, cv.width * 0.62);
      r.addColorStop(0, 'rgba(0,0,0,0.42)'); r.addColorStop(0.6, 'rgba(0,0,0,0.18)'); r.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = r; g.fillRect(0, 0, cv.width, cv.height); return;
    }
    const r = g.createRadialGradient(cv.width * x, cv.height * y, 0, cv.width * x, cv.height * y, cv.height * 0.62);
    r.addColorStop(0, centro); r.addColorStop(0.55 * forza, '#08080a'); r.addColorStop(1, bordo);
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = r; g.fillRect(0, 0, cv.width, cv.height);
  };
  // spinta di camera lenta e centrata: non torna mai indietro
  M.spinta = (g, cv, S, t, durata, quanto = 0.06, cy = 0.47) => {
    const p = 1 + quanto * M.outCubic(t / durata);
    g.setTransform(S * p, 0, 0, S * p, (cv.width / 2) * (1 - p), cv.height * cy * (1 - p));
  };
  // testo parola per parola: ogni parola sale di poco e passa da sfocata a nitida
  M.parole = (g, S, testo, { font, colore = '#fff', x, y, t, da, passo = 0.08, durata = 0.5, sale = 14, sfoca = 8, spazio = 0 }) => {
    g.font = font; g.textBaseline = 'alphabetic';
    const ws = testo.split(' '), sp = g.measureText(' ').width;
    const larg = ws.map((w) => g.measureText(w).width + spazio * (w.length - 1)), tot = larg.reduce((a, b) => a + b, 0) + sp * (ws.length - 1);
    let cx = x - tot / 2;
    ws.forEach((w, i) => {
      const k = M.outCubic(M.prog(t, da + i * passo, da + i * passo + durata));
      if (k > 0) {
        g.save(); g.globalAlpha = k; g.filter = `blur(${(1 - k) * sfoca * S}px)`; g.fillStyle = colore;
        if (M.trasparente()) { g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 18 * S; }
        if (spazio) { let xx = cx; for (const ch of w) { g.fillText(ch, xx, y + (1 - k) * sale); xx += g.measureText(ch).width + spazio; } }
        else g.fillText(w, cx, y + (1 - k) * sale);
        g.restore();
      }
      cx += larg[i] + sp;
    });
  };
  // linea di luce sottile che sfuma ai lati
  M.linea = (g, S, cx, y, larg, alfa = 1, alone = 20) => {
    if (larg <= 0.5 || alfa <= 0) return; g.save(); g.globalAlpha = alfa;
    const gr = g.createLinearGradient(cx - larg / 2, 0, cx + larg / 2, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, '#fff'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.shadowColor = 'rgba(255,255,255,0.8)'; g.shadowBlur = alone * S; g.fillRect(cx - larg / 2, y - 1.2, larg, 2.4); g.restore();
  };
  // grana leggera: toglie gli "scalini" sui fondi scuri dopo la compressione dei social
  let rumore = null;
  M.grana = (g, cv, t, forza = 0.035) => {
    if (M.trasparente()) return;
    if (!rumore) { rumore = document.createElement('canvas'); rumore.width = rumore.height = 512; const n = rumore.getContext('2d'), d = n.createImageData(512, 512);
      for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; } n.putImageData(d, 0, 0); }
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = forza; g.globalCompositeOperation = 'overlay';
    g.translate(-Math.floor((t * 977) % 512), -Math.floor((t * 613) % 512)); g.fillStyle = g.createPattern(rumore, 'repeat'); g.fillRect(0, 0, cv.width + 512, cv.height + 512); g.restore();
  };
  // avvio standard: con ?t= disegna un solo istante, altrimenti fa vedere l'animazione in loop nel browser
  M.avvia = (render, durata, attese = []) => {
    const q = new URLSearchParams(location.search);
    window.TOTAL = durata; window.renderAt = (t) => render(t);
    window.ready = Promise.all(attese).catch(() => {}).then(() => {
      if (q.has('t')) render(parseFloat(q.get('t'))); else (function giro(ms) { render((ms / 1000) % durata); requestAnimationFrame(giro); })(0);
      return true;
    });
  };
  window.MOTORE = M;
})();
