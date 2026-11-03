## Grafica: stile ListaUI
Video a lista ("3 cose che…", "i miei 3 trucchi…") come i reel tech americani: Denis parla, e per circa metà del tempo il video lascia spazio a SCHERMATE animate pulite stile app, su fondo crema. Ci si entra con un cerchio bianco che si allarga. La voce non si ferma mai; i sottotitoli piccoli li mette lo script.
- `schermate` (campo in cima alla regia, accanto a `keywords`): la parte principale dello stile. Ognuna `{"frase": "F012", "ritardo": 0.2, "dur": 2.5, "tipo": "...", ...}`, ancorata a una frase usata nel montaggio. Tipi:
  - `capitolo`: cartella blu con "No.N" e il titolo del punto della lista. `{"tipo": "capitolo", "numero": 1, "titolo": "Contesto"}` (titolo max ~20 caratteri, 1–3 parole). Sulla frase in cui Denis annuncia il punto ("numero uno…", "il secondo…"), `dur` 1,8–2,5.
  - `chat`: casella di chat dove il testo si scrive da solo. `{"tipo": "chat", "titolo": "ChatGPT", "testo": "quello che si scrive"}` (testo max ~90 caratteri, quello che Denis dice di chiedere o scrivere). `dur` 2,5–4.
  - `finestra`: finestra di file con una colonna di cartelle (`voci`, 4–6 nomi brevi) e le miniature che compaiono. `{"tipo": "finestra", "titolo": "workspace", "voci": ["progetti", "idee"], "media": ["IMG_1234", "IMG_1240"]}`. `dur` 2,5–4.
  - `griglia`: profilo social su un telefono con la griglia dei video che scorre. `{"tipo": "griglia", "titolo": "@_black_den", "media": [...]}`. Quando Denis parla dei suoi video, del profilo, dei risultati. `dur` 2–3,5.
  - `app`: scheda di un'app con nome, prompt che si scrive, pulsante "Genera" che carica e i risultati. `{"tipo": "app", "titolo": "Suno", "testo": "il prompt"}`. Quando parla di un'app o di uno strumento. `dur` 3–4,5.
  - `pillola`: pillola bianca SOPRA il volto, non lo copre: con `numero` mostra la cartella e "No.N" (ricorda in che punto della lista siamo), senza `numero` è un lettore musicale con le barre (`titolo` = nome del brano o dell'app, `testo` = 2–4 parole). `dur` 2–4.
  - `media`: SOLO immagini della cartella (id o nome del file, vedi Sorgenti/immagini), fino a 9. Senza immagini le miniature restano riquadri vuoti colorati: va bene lo stesso.
- Ritmo: una schermata ogni 3–6 s. Il volto apre il video (aggancio, almeno 2–3 s) e lo chiude; tra un capitolo e l'altro alterna volto (con una `pillola`) e schermate piene. Ogni punto della lista: `capitolo` + 1–3 schermate che mostrano quello che spiega. Mai due schermate piene una sopra l'altra.
- Il testo nelle schermate è breve e concreto, con le parole di Denis; niente frasi lunghe né inventate.
- `titolo`: 2–4 parole, il tema del video in grande verde menta in apertura sopra il volto (es. "Montaggio AI" / "3 trucchi"). `soggetto`: il tema in breve. `tavola`: "".
- `keywords`: [] (questo stile usa le schermate). `flickers`: [].
- `sponsor`: null; se il brief cita uno sponsor, fagli una schermata `app` col suo nome sulla frase in cui viene nominato.
- `note`: una riga per Denis con dubbi o scelte fatte.
