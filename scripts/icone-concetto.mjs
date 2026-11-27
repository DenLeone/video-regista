// Icone di concetto (Denis, 27/11, stile «Elaborato»): quadratini bianchi arrotondati con una piccola icona che entra
// con un «pop» vicino alle mani quando nomina la cosa (corsa, diamante, messaggio…). Le icone sono di Tabler
// (@tabler/icons-react, già nel progetto): l'AI sceglie SOLO da questa lista, il resto si scarta.
// L'elenco deve restare uguale a src/iconeConcetto.tsx (c'è un test che lo controlla).
export const ICONE_CONCETTO = {
  corsa: 'IconRun', diamante: 'IconDiamond', messaggio: 'IconMessageCircle', idea: 'IconBulb', cuore: 'IconHeart',
  stella: 'IconStar', spunta: 'IconCheck', fulmine: 'IconBolt', razzo: 'IconRocket', orologio: 'IconClock',
  soldi: 'IconCoin', scudo: 'IconShield', camera: 'IconCamera', musica: 'IconMusic', telefono: 'IconPhone',
  carrello: 'IconShoppingCart', regalo: 'IconGift', bersaglio: 'IconTarget', trofeo: 'IconTrophy', fuoco: 'IconFlame',
  utenti: 'IconUsers', grafico: 'IconChartLine', lucchetto: 'IconLock', mondo: 'IconWorld', occhio: 'IconEye',
};
export const NOMI_ICONE = Object.keys(ICONE_CONCETTO);

/**
 * regia.icone_concetto [{frase, icona, dette?, lato?}] → [{nome, at, dur, lato}] per il piano.
 * `inizio(frase)` = secondo in cui la frase comincia nel montaggio (null se non è stata usata);
 * `trova(dette, base)` = {at} della parola detta, se c'è. Al massimo 5, distanti almeno 3 s, lati alternati.
 */
export function iconeConcettoDa(lista, { inizio, trova = () => null, totale = Infinity, avvisi = [] }) {
  const out = [];
  for (const ic of Array.isArray(lista) ? lista : []) {
    const nome = String(ic?.icona || '').toLowerCase().trim();
    if (!ICONE_CONCETTO[nome]) { avvisi.push(`icona di concetto «${nome || '?'}»: non è nella lista, tolta`); continue; }
    const base = ic.frase ? inizio(ic.frase) : null;
    if (base == null) { avvisi.push(`icona di concetto ${nome}: frase ${ic.frase || '?'} non usata nel montaggio, tolta`); continue; }
    const detta = ic.dette ? trova(String(ic.dette), base) : null;
    const at = Math.max(0, detta ? detta.at - 0.1 : base + 0.1);
    if (at > totale - 1) continue;
    out.push({ nome, at: Math.round(at * 100) / 100, dur: 1.8, lato: /^s/i.test(String(ic.lato || '')) ? 'sinistra' : /^d/i.test(String(ic.lato || '')) ? 'destra' : null });
  }
  out.sort((a, b) => a.at - b.at);
  const buone = [];
  for (const x of out) { if (buone.length < 5 && (!buone.length || x.at - buone[buone.length - 1].at >= 3)) buone.push(x); }
  buone.forEach((x, i) => { x.lato = x.lato || (i % 2 === 0 ? 'destra' : 'sinistra'); });
  return buone;
}
