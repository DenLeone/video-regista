// 🟩 Zone del verticale (Denis 19/11, TASSATIVE): un solo file, zone.json alla radice del repo.
// Ogni posizione nei video verticali deve stare dentro `sicura`, fuori da `tasti` (in basso a destra) e mai nel `cimitero`.
import Z from '../zone.json';
export const ZONA = Z;
// rettangolo dentro le zone? (x, y = angolo in alto a sinistra)
export function dentroZona(x: number, y: number, w: number, h: number): boolean {
  const s = Z.sicura;
  if (x < s.x0 || y < s.y0 || x + w > s.x1 || y + h > s.y1) return false;
  if (y + h > Z.tasti.y0 && x + w > Z.tasti.x0) return false;
  return true;
}
// porta un «top» dentro la zona, sapendo quanto è alta la cosa
export const topInZona = (top: number, alto = 0) => Math.max(Z.sicura.y0, Math.min(top, Z.sicura.y1 - alto));
