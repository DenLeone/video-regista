# Stile Black Den Motion

Regole di partenza. Se l'utente dà indicazioni diverse, vincono le sue.

## Ritmo
- Un'idea per volta. Un nuovo elemento ogni 0,3–0,6 s, non tutto insieme.
- Entrate: 0,5–0,8 s con `expoOut` (parte veloce, si posa morbido).
- Uscite: 0,3–0,5 s con `in`, più brevi delle entrate.
- Tenuta: ogni testo resta fermo e leggibile almeno 1,2 s (il tempo di leggerlo due volte ad alta voce).
- Stagger lettere: 0,03–0,06 s. Stagger di righe o card: 0,08–0,15 s.
- Un movimento continuo leggero (spinta di camera 3–6 %, deriva di particelle) evita che la scena sembri ferma.

## Movimento
- Muovi poco ma deciso: spostamenti di 40–120 px su 1080 di larghezza.
- Combina 2 proprietà per entrata (es. `y` + `o`, oppure `clip` + `ls`). Tre al massimo.
- `blur` in entrata 8–16 px per dare velocità; mai blur su testi che devono restare leggibili.
- `back` solo per oggetti piccoli (icone, badge). Sui titoli grandi sembra economico.
- Evita rotazioni oltre ±8° sui testi.

## Tipografia
- Titolo: peso 800–900, 120–180 px in verticale 1080×1920. Massimo 2 righe.
- Sottotitolo: 30–44 px, spaziatura 8–14 px, colore accento.
- Corpo minimo leggibile su telefono: 36 px.
- Un font, al massimo due pesi più l'accento. Sempre file locali in `assets/`.

## Colore
- Base scura (#050505–#111), testo quasi bianco (#f2f2f2–#fafafa), un solo colore accento.
- Accento solo su 1–2 elementi per scena: sottotitolo, linea, bagliore.
- Contrasto testo/sfondo almeno 4,5:1.

## Zone sicure social (9:16, 1080×1920) — valori indicativi
L'interfaccia di TikTok, Reels e Shorts copre i bordi. Tieni testi e loghi dentro:
- alto: lascia libero circa 220 px;
- basso: lascia libero circa 420 px (didascalia, nome, musica);
- destra: lascia libero circa 160 px (like, commenti, condividi);
- sinistra: almeno 60 px.
Area consigliata per il contenuto importante: x 60–920, y 220–1500.

## Motion blur
- Nel render finale usa `--mblur 8`: i movimenti veloci (pop, punch, telefono, parole che entrano) sembrano filmati.
- Con il blur i movimenti possono essere un po' più veloci senza diventare scattosi.
- Non serve per scene quasi ferme: allunga il render senza differenze visibili.

## Suono
- Il suono deve cadere esattamente sul fotogramma dell'azione: i preset lo fanno da soli, i keyframe manuali no.
- Un impatto forte solo sui momenti chiave (cambio scena, logo). Troppi impatti stancano.
- Con la musica: gli effetti restano sopra, la musica si abbassa da sola mentre suonano.
- Ultimo mezzo secondo pulito: niente suoni che vengono tagliati a metà alla fine.

## Formati
| Uso | Formato | Note |
|---|---|---|
| TikTok / Reels / Shorts | 1080×1920, 30 fps | `--scale 2` per master 4K |
| YouTube orizzontale | 1920×1080, 30 o 60 fps | |
| Overlay per DaVinci/Fusion | come il progetto, `--alpha` | ProRes 4444 con trasparenza |

## Controllo prima del render finale
- Nessun testo tagliato o sovrapposto in nessun fotogramma di controllo.
- Primo e ultimo fotogramma puliti (utile per loop e tagli).
- Niente elementi importanti fuori dalle zone sicure.
- Ortografia dei testi verificata lettera per lettera.
