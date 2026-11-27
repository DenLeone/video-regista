// Rigenera src/iconeConcettoElenco.tsx (import e mappa nome → icona Tabler) da scripts/icone-concetto.mjs.
import fs from 'node:fs';
import { ICONE_CONCETTO } from './icone-concetto.mjs';

export function contenuto() {
  const comp = [...new Set(Object.values(ICONE_CONCETTO))].sort();
  const righe = Object.entries(ICONE_CONCETTO).map(([k, v]) => `  ${k}: ${v},`);
  return `// FILE GENERATO da scripts/genera-icone-concetto.mjs (fonte: scripts/icone-concetto.mjs). Non modificarlo a mano.
import React from 'react';
import {
${comp.map((c) => `  ${c},`).join('\n')}
} from '@tabler/icons-react';

export const ICONE_CONCETTO: Record<string, React.ComponentType<{ size?: number; stroke?: number; color?: string }>> = {
${righe.join('\n')}
};
`;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  fs.writeFileSync(new URL('../src/iconeConcettoElenco.tsx', import.meta.url), contenuto());
  console.log(`icone: ${Object.keys(ICONE_CONCETTO).length}`);
}
