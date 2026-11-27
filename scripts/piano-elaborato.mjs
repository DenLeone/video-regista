// Stile «Elaborato»: pagina profilo e scheda editor non devono dipendere dall'AI (Gemini ignora i campi nuovi della regia).
// Se lo stile le vuole e la regia non le ha piazzate, vanno dove stanno nel riferimento: pagina profilo a 2,5 s, scheda editor a 6 s.
// Le icone di concetto che cadono sotto una scheda si tolgono. Si applica al piano prima del render; il render ha la stessa regola come rete di sicurezza.
export function completaPianoElaborato(piano) {
  const g = piano?.grafica || {};
  const durata = (piano?.clips || []).reduce((s, c) => s + Math.max(0, c.end - c.start), 0);
  let pagina = piano.paginaProfilo || [];
  let editor = piano.schedeEditor || [];
  const libero = (at, dur) => ![...pagina, ...editor].some((s) => at < s.at + s.dur + 0.6 && at + dur > s.at - 0.6);
  if (g.paginaProfilo && !pagina.length && durata >= 9 && libero(2.5, 2.4)) pagina = [{ at: 2.5, dur: 2.4 }];
  if (g.schedaEditor && !editor.length && durata >= 12 && libero(6, 2.8)) editor = [{ at: 6, dur: 2.8 }];
  if (pagina.length) piano.paginaProfilo = pagina;
  if (editor.length) piano.schedeEditor = editor;
  const occupati = [...pagina, ...editor];
  if (piano.iconeConcetto?.length) piano.iconeConcetto = piano.iconeConcetto.filter((i) => !occupati.some((s) => i.at < s.at + s.dur + 0.3 && i.at + i.dur > s.at - 0.3));
  // numeri soltanto (il log è pubblico): cosa arriva davvero al render
  return `elaborato: flag pagina ${g.paginaProfilo ? 'sì' : 'no'}, scheda ${g.schedaEditor ? 'sì' : 'no'}, medie ${g.paroleMedie ? 'sì' : 'no'}, petto ${g.sulPetto ? 'sì' : 'no'}, tessere ${g.tessere ? 'sì' : 'no'} · piano: pagine ${(piano.paginaProfilo || []).length}, schede ${(piano.schedeEditor || []).length}, icone ${(piano.iconeConcetto || []).length}, giganti ${(piano.enfasi || []).length}, medie AI ${(piano.enfasiMedia || []).length} · ${durata.toFixed(1)} s`;
}
