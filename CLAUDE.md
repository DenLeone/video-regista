# Regista (video-regista)

Leggi prima `PASSAGGIO.md` (com'è fatto il progetto). Repo PUBBLICO: mai girato, voce, segreti o nomi dei video di
Denis nel codice o nei log (nei log solo conteggi). Parla con Denis in italiano, frasi brevi (ha l'ADHD).

## Come scrivere codice qui (4 regole, dalle «Karpathy guidelines», multica-ai/andrej-karpathy-skills, MIT)
1. **Pensa prima di scrivere.** Di' cosa stai dando per scontato; se una richiesta si può capire in due modi, chiedi o
   scegli e dillo. Se c'è una strada più semplice, proponila.
2. **Prima la semplicità.** Il codice minimo che risolve il problema: niente funzioni «per il futuro», niente
   configurazioni che nessuno ha chiesto, niente astrazioni per un solo uso.
3. **Cambi chirurgici.** Tocca solo quello che serve alla richiesta, nello stile del file. Non riscrivere, non
   «sistemare» codice vicino che funziona, non cancellare commenti. Ogni riga cambiata deve servire alla richiesta.
4. **Lavora verso un risultato verificabile.** Decidi prima come si vede che è fatto (un test, un render, un
   fotogramma) e non dire «fatto» finché non l'hai visto: `npm test`, prova in locale, giro vero di sola lettura.

## Scene e motion
- Scene fatte a mano: `motion/scene/*.js` (vedi `scripts/scene-mano.mjs`), motore in `motion/bdm/`.
- Skill: `.claude/skills/blackden-motion` (regia ed esempi), `remotion-regole`, `anti-slop-writing` (testi).
