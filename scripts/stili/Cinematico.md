## Grafica: stile Cinematico
Look da spot di prodotto: immagini calde e pulite, sottotitoli bianchi parola per parola al centro (li mette lo script da solo, non scriverli), pochi titoli grandi con il nome del prodotto e i dati.
- `keywords` = i TITOLI: 3–5 in tutto, MAI la trascrizione. Ognuno è ancorato a una frase usata nel montaggio (`frase`), con `ritardo` in secondi dall'inizio di quella frase (0–1) e `dur` 2–3,5 s.
  - `word`: il nome del prodotto o un dato in forma brevissima, come nei titoli degli spot: "ROG ALLY X", "120 Hz", "45 €", "IP55". Max ~16 caratteri. Nomi di prodotto in MAIUSCOLO; numeri e unità come si scrivono (Hz, mAh, €).
  - `tag`: etichetta piccola sopra il titolo, la marca o la categoria ("ASUS", "Batteria", "Display"). Facoltativa.
  - `note`: sottotitolo giallo sotto il titolo, 1–4 parole che danno il dato o il contesto ("20° anniversario", "fino a 14 ore", "metà prezzo"). Senza "// " e senza ironia forzata.
  1. Il primo titolo è il prodotto (tag = marca, word = nome, note = cosa lo rende speciale), sulla frase in cui Denis lo nomina o in apertura.
  2–4. I numeri e le specifiche che Denis dice (prezzo, autonomia, misure, confronto), sulla frase in cui li dice.
  5. Solo se c'è un verdetto netto: titolo breve ("PROMOSSO", "DA PRENDERE"), `"fino_alla_fine": true`.
  - `top`: y del titolo (0–1920), default 380 (in alto). Se in quell'inquadratura il prodotto o il volto stanno in alto, usa 1250.
  - Il titolo è il dato, non la frase: non ripetere parola per parola quello che si sta già leggendo nei sottotitoli.
  - **Senza parlato** (Denis registra la voce dopo): 3–4 titoli agganciati con `elemento`, uno ogni 7–10 s, il primo sul primo o secondo elemento (tag = marca, word = nome del prodotto); poi le funzioni che si vedono nelle riprese; lascia libero l'ultimo terzo del video o chiudi con un titolo `fino_alla_fine`. Inquadrature da 1,5–3 s, movimenti lenti, tanti dettagli.
- `flickers`: [] (questo stile non ne ha). `tavola`: "". `soggetto`: nome breve del prodotto.
- `sponsor`: null; se il brief cita uno sponsor, mettilo come titolo (tag "In collaborazione con", word = marca) sulla frase in cui viene nominato.
- **Inquadrature in questo stile** (sostituisce la regola "almeno metà delle frasi sul volto"): contano le immagini del prodotto. Il volto resta per l'aggancio, i commenti personali e la chiusura, circa un terzo delle frasi; nelle frasi che descrivono il prodotto preferisci B-roll ravvicinati, lenti e puliti (dettagli, luci, materiali, prodotto in uso). Restano valide tutte le altre regole: niente bocca che parla sopra la voce, niente mani davanti, niente inquadrature mosse o sfocate, mai più di 2 frasi di fila sulle sole mani.
- `note`: una riga per Denis con dubbi o scelte fatte.
