// Nome cartella chiesto dal bot o da Actions, confrontato con i nomi veri su Drive.
// Lo spazio in fondo non è un'altra cartella: "Manifestazioni " e "Manifestazioni" sono la stessa
// (20/10, due montaggi falliti). Se dopo il trim ne resta più di una, non si indovina.
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function scegliCartella(richiesto, esistenti) {
  const nome = String(richiesto ?? '').trim();
  const lista = (esistenti || []).map((x) => String(x));
  if (!nome) return null;
  if (lista.includes(nome)) return nome;
  const norm = (t) => String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  const uguali = lista.filter((x) => norm(x) === norm(nome));
  return uguali.length === 1 ? uguali[0] : null;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const vero = scegliCartella(process.argv[2] || '', process.argv.slice(3));
  if (!vero) process.exit(2);
  process.stdout.write(vero);
}
