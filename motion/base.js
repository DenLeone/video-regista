// Motion · parti comuni ai modelli: parametri, formato, font che entra nello schermo, argento, riflesso.
// I parametri arrivano da params.js (scritto da scripts/motion.mjs) come window.PARAMS.
(function () {
  const P = Object.assign({ testo: 'BlackDen', sotto: '', invito: '', formato: 'verticale' }, window.PARAMS || {});
  const oriz = P.formato === 'orizzontale';
  const W = oriz ? 1920 : 1080, H = oriz ? 1080 : 1920;
  const B = {
    P, oriz, W, H, CX: W / 2, CY: H * (oriz ? 0.45 : 0.47),
    // grandezza del testo: la più grande che entra nell'82% della larghezza (max 180/200)
    adatta(ctx, testo, famiglia, peso = 600, max = oriz ? 200 : 180, min = 56, quota = 0.82) {
      let fs = max;
      for (; fs > min; fs -= 4) { ctx.font = `${peso} ${fs}px ${famiglia}`; if (ctx.measureText(testo).width <= W * quota) break; }
      return fs;
    },
    argento(g, y, s) { const gr = g.createLinearGradient(0, y - s * 0.7, 0, y + s * 0.1); gr.addColorStop(0, '#ececf0'); gr.addColorStop(0.5, '#d6d6db'); gr.addColorStop(1, '#6e6e77'); return gr; },
    // banda chiara che scorre sul livello del testo (solo dove c'è scritta)
    riflesso(g, x, y, fs) {
      g.save(); g.globalCompositeOperation = 'source-atop'; const gr = g.createLinearGradient(x - 110, 0, x + 110, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, '#fff'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(x - 110, y - fs, 220, fs * 1.4); g.restore();
    },
    livello(cv) { const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height; return c; },
    // spaziatura sotto il titolo, proporzionata alla grandezza del testo
    sottoY: (fs) => fs * 0.36,
  };
  window.BASE = B;
})();
