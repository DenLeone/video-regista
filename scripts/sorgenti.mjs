// Riconosce da che dispositivo arriva ogni file e decide quale audio usare.
// Regole di Denis: un file audio separato = microfono esterno (vince sempre),
// poi Insta360, poi iPhone. La Sony registra quasi sempre audio ma quasi mai
// col microfono: serve solo per sincronizzarla, non si ascolta.

import path from 'node:path';

export const VIDEO_EXT = ['.mp4', '.mov', '.m4v', '.mkv', '.webm'];
export const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.heic', '.webp'];
export const AUDIO_EXT = ['.wav', '.mp3', '.m4a', '.aac', '.flac', '.aif', '.aiff', '.ogg'];

export const NOMI_DISPOSITIVO = { mic: 'mic esterno', insta: 'Insta360', iphone: 'iPhone', altro: 'camera', sony: 'Sony' };
const PRIORITA = { mic: 1, insta: 2, iphone: 3, altro: 4, sony: 5 };
export const prioritaAudio = (dispositivo) => PRIORITA[dispositivo] ?? 9;

// tags = format.tags + tags dei flussi di ffprobe, tutto in un oggetto piatto
export function dispositivo(nomeFile, tags = {}) {
  const ext = path.extname(nomeFile).toLowerCase();
  if (AUDIO_EXT.includes(ext)) return 'mic';
  const base = path.basename(nomeFile);
  const valori = Object.values(tags).join(' ');
  const chiavi = Object.keys(tags).join(' ');
  if (/insta360/i.test(valori) || /^(VID|PRO|LRV)_\d{8}_\d{6}/i.test(base)) return 'insta';
  if (/apple/i.test(tags['com.apple.quicktime.make'] || tags.make || '') || /com\.apple\.quicktime/i.test(chiavi) || /^IMG_\d+/i.test(base)) return 'iphone';
  if (/xavc/i.test(tags.major_brand || '') || /sony/i.test(valori) || /^C\d{4}/i.test(base)) return 'sony';
  return 'altro';
}

export function tagsPiatti(probeJson) {
  const out = { ...(probeJson.format?.tags || {}) };
  for (const s of probeJson.streams || []) Object.assign(out, s.tags || {});
  for (const k of Object.keys(out)) out[k.toLowerCase()] = out[k];
  return out;
}
