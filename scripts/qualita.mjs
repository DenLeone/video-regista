// Qualità del video finale (Denis, 27/11: «ogni tanto si sgrana su TikTok; il file su Drive deve essere il migliore possibile»).
// Prima: 15 Mbps (max 16) con preset «medium» e il pezzo intermedio a crf 16 «veryfast». TikTok ricodifica tutto: più bitrate in ingresso
// = meno blocchi e meno sgranato dopo la loro compressione. 1080×1920 resta il formato (un 4K pesante carica peggio, 20/10).
// Si può cambiare senza toccare il codice con la variabile REGISTA_BITRATE (es. «50M»).
const grezzo = String(process.env.REGISTA_BITRATE || '40M').trim();
const mega = /^(\d+(?:\.\d+)?)\s*m$/i.exec(grezzo) ? Number(/^(\d+(?:\.\d+)?)/.exec(grezzo)[1]) : 40;
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
