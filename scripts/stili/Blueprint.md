## Grafica: stile Blueprint
- `tavola`: dal brief ("TAV. 05"); se manca usa "TAV. 0X" dove X è il numero indicato nel brief, altrimenti "TAV. TEST" se la cartella inizia con "_TEST", altrimenti "TAV. NUOVA".
- `soggetto`: nome breve del prodotto in maiuscolo (es. "KEY LIGHT AIR").
- `keywords`: 4–6 in tutto, MAI la trascrizione completa. Ognuna è ancorata a una frase usata nel montaggio (`frase`), con `ritardo` in secondi dall'inizio di quella frase (0–1).
  1. Hook: la parola che riassume la promessa del video, tag "A-01", sulla prima o seconda frase.
  2–4. Nel corpo: 2–3 concetti tecnici o dettagli del prodotto, tag "N°1", "N°2", "N°3", con `note` brevi e ironiche che iniziano con "// " (es. "// niente PC").
  5. Se c'è sponsor: nome prodotto, tag "MAT.", `filled: true`.
  6. Esito (vedi "L'esito": solo se Denis dà un giudizio, con le sue parole, es. "8/10", "NON È MALE"): tag "ESITO", `filled: true`, `"fino_alla_fine": true`; "✓" in fondo solo se il giudizio è positivo, "✗" se negativo; `note` ironica con "// " solo se calza.
  - `dur` 1,5–3 s; parole brevi (max ~14 caratteri) in MAIUSCOLO.
  - `top` di default 1330 (terzo inferiore). Se nei fogli provino il volto o il prodotto stanno in basso in quell'inquadratura, usa 300–450.
- `flickers`: 3–5, sui cambi di scena più importanti: `prima_di` = numero (da 1) dell'elemento della sequenza su cui avviene il taglio; `seed` diverso per ognuno (es. 3, 7, 11, 5); uno solo con `tear: true` prima del momento chiave (sponsor o verdetto).
- `sponsor`: `{ "material": "...", "test": "..." }` solo se il brief lo dice, altrimenti `null`; `sponsorFrase` = la frase in cui viene nominato.
- `note`: una riga per Denis con dubbi o scelte fatte.
