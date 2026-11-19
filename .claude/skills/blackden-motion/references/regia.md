# Regia — come far sembrare una motion graphic fatta da un'agenzia

Black Den Motion · v1.2 · skill creata da Den (Black Den)

Queste regole contano più dei preset. Leggile prima dello storyboard e ricontrollale sui fotogrammi.

## 1. Le inquadrature si trasformano, non si dissolvono
- Ogni inquadratura nasce da quella prima: una scheda che si gira e diventa lo sfondo, un numero che si allarga
  e diventa una barra, un logo che si rimpicciolisce e diventa il badge.
- Dissolvenza incrociata tra due scene diverse = ultima risorsa. Prima chiediti: *quale forma di adesso diventa
  la forma di dopo?*
- Nello storyboard ogni riga ha la colonna «diventa»: se è vuota, l'inquadratura non è ancora pensata.

## 2. Quello che conta sta al centro
- L'occhio non deve cercare: il soggetto dell'inquadratura sta sulla croce invisibile al centro.
- Nei formati verticali tieni testi e soggetti tra 250 e 1550 px di altezza (le interfacce dei social coprono il resto).

## 3. Qualcosa si muove sempre
- Anche nelle pause: una spinta lenta della camera (`P.drift`, `M3.camera`), una scheda che ondeggia
  (`M3.oscilla`), particelle. Un fotogramma fermo sembra un video bloccato.

## 4. La direzione non torna indietro
- Niente zoom avanti e poi indietro, niente scala che sale e poi scende, niente orbita che si ferma e riparte al contrario.
- Un movimento lungo = una curva sola (`M3.camera` usa un'unica curva con un solo easing). Due tratti
  attaccati si vedono come uno scatto.

## 5. Veloce, poi lento più a lungo
- Le entrate sono rapide (0,3–0,6 s), le tenute lunghe abbastanza da leggere (almeno 1 s ogni 3 parole).
- Le prime versioni sono quasi sempre troppo veloci: nel dubbio, allunga le tenute.
- Easing: `out` o `expoOut` per arrivare, `inOut` per gli spostamenti lunghi, `in` solo per uscire.

## 6. Le forme restano coerenti
- Un oggetto che si trasforma mantiene proporzioni e angoli credibili; le parti che si muovono insieme
  tengono la stessa velocità e la stessa distanza.

## 7. Testi
- Font del brand, righe corte, al massimo 6 parole per riga.
- Entrata da sfocato a nitido con una piccola salita. Niente rimbalzi sui testi lunghi.
- Un solo colore d'accento per inquadratura, sulla parola che conta.

## 8. Luce e profondità (modalità 3D)
- Una sola luce principale, da un lato e dall'alto: è quella che rende il 3D «cinematografico».
- Profondità di campo: a fuoco quello che la camera guarda, lo sfondo morbido (`M3.init({ fuoco })`).
- Nebbia leggera verso il colore di fondo: le schede lontane spariscono invece di tagliarsi.

## 9. Interfacce vere, pulite
- Screenshot veri o ricostruzioni fedeli; via dati personali, notifiche e badge rossi.
- Il logo non si ritaglia da uno screenshot e non si ridisegna a memoria.

## 10. Chiudi con un'azione
- L'ultima inquadratura dice cosa fare: segui, link, cerca, scarica. Si progetta il finale e poi si torna indietro.

## Checklist sui fotogrammi di controllo
| Domanda | Se no |
|---|---|
| Ogni passaggio è una trasformazione? | Trova la forma ponte tra le due scene |
| Il soggetto è al centro? | Sposta camera o elemento |
| C'è movimento in ogni fotogramma? | Aggiungi drift/oscilla |
| Nessun movimento torna indietro? | Unisci i tratti in una curva sola |
| Le tenute si leggono? | Allunga di 0,3–0,5 s |
| Testi dentro le zone sicure, niente tagliato? | Riposiziona |
| Nel 3D: luce da un lato, sfondo sfocato? | Controlla `luce` e `fuoco` |
