// Qualità del video finale (Denis, 27/11: «ogni tanto si sgrana su TikTok; il file su Drive deve essere il migliore possibile»).
// Prima: 15 Mbps (max 16) con preset «medium» e il pezzo intermedio a crf 16 «veryfast». Le piattaforme ricodificano tutto: più bitrate in
// ingresso aiuta, ma oltre ~20 Mbps non si guadagna e i file diventano troppo pesanti da caricare dal telefono (limiti citati dalle guide:
// circa 287 MB su iOS, 72 MB su Android, 500 MB–1 GB da computer). A 20 Mbps un video di 90 s pesa ~225 MB. 1080×1920 resta il formato.
// Si può cambiare senza toccare il codice con la variabile REGISTA_BITRATE (es. «30M»).
const grezzo = String(process.env.REGISTA_BITRATE || '20M').trim();
const mega = /^(\d+(?:\.\d+)?)\s*m$/i.exec(grezzo) ? Number(/^(\d+(?:\.\d+)?)/.exec(grezzo)[1]) : 20;
export const QUALITA = {
  videoBitrate: `${mega}M`,
  maxRate: `${Math.round(mega * 1.1)}M`,
  buffer: `${Math.round(mega * 2.2)}M`,
  x264Preset: 'slow',   // meglio compresso a pari bitrate (prima «medium», il default di Remotion)
  masterCrf: '12',      // il pezzo tagliato dal girato è un passaggio intermedio: quasi senza perdite (prima crf 16)
  masterPreset: 'fast', // prima «veryfast»
  masterAudio: '256k',  // prima 160k, poi ricodificato a 320k dal render
  audio: '320k',
};
