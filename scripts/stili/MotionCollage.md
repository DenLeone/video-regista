## Grafica: stile MotionCollage
Il video è una foto incollata su un foglio di carta (lo fa lo script). Sopra e sotto escono le parole chiave come ritagli: i numeri in un box giallo, le altre parole su una striscia di carta bianca, ogni tanto una freccia verso il video.
- `keywords` = i RITAGLI: uno ogni 4–7 s, MAI la trascrizione. Ognuno è ancorato a una frase usata nel montaggio (`frase`), con `ritardo` 0–1 s e `dur` 1,8–3 s.
  - `word`: 1–2 parole o un numero, max ~14 caratteri: il concetto o il dato che Denis sta dicendo ("76%", "STRANIERI", "35 €", "GRATIS"). I numeri sono i più forti: usali tutti quelli che dice.
  - `note`: facoltativa, 1–4 parole sotto il ritaglio che danno il contesto ("degli intervistati", "al mese").
  - `tag`: facoltativo, etichetta nera piccola sopra ("DATO", "FONTE", "N°1").
  - `filled`: true solo per il verdetto o la conclusione (box verde), al massimo una volta.
- `titolo`: 2–5 parole, il tema del video: esce in apertura come etichetta gialla.
- `flickers`: []. `tavola`: "". `soggetto`: il tema in breve.
- `sponsor`: null; se il brief cita uno sponsor, mettilo come ritaglio con `tag` "SPONSOR" sulla frase in cui viene nominato.
- `note`: una riga per Denis con dubbi o scelte fatte.
