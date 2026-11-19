// 🛡️ Guardia (19/11, dopo la notte di Grok: regista.yml e telegram/src/index.ts troncati su main, montaggi falliti
// per mezz'ora). A ogni push su main confronta i file con il commit di prima e avvisa Denis su Telegram se:
//   - un file importante (workflow, script, bot, composizioni) perde più di metà delle righe,
//   - un file importante sparisce,
//   - un workflow non è più YAML valido, o uno script .mjs/.js non è più JavaScript valido.
// Una modifica voluta (es. un file riscritto più corto) passa scrivendo «guardia: ok» nel messaggio del commit.
//   node scripts/guardia.mjs <prima> <dopo>          (in GitHub Actions: github.event.before / after)
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const IMPORTANTI = /^(\.github\/workflows\/[^/]+\.ya?ml|scripts\/[^/]+\.(mjs|js|sh|py)|telegram\/src\/.+\.(ts|js)|bot\/src\/.+\.js|src\/.+\.tsx?)$/;
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 1 << 26 });
const righe = (rev, f) => { try { return execFileSync('git', ['show', `${rev}:${f}`], { encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').length; } catch { return 0; } }; // file nuovo: 0

export function controlla(cambi, { prima, dopo }) {
  const problemi = [];
  for (const { stato, file } of cambi) {
    if (!IMPORTANTI.test(file)) continue;
    if (stato === 'D') { problemi.push(`🗑 ${file}: cancellato`); continue; }
    const a = prima(file), b = dopo(file);
    if (a >= 60 && b < a * 0.5) problemi.push(`✂️ ${file}: da ${a} a ${b} righe`);
  }
  return problemi;
}

function sintassi(file, rev) {
  const tmp = path.join(os.tmpdir(), `guardia-${path.basename(file)}`);
  try { fs.writeFileSync(tmp, git('show', `${rev}:${file}`)); } catch { return null; }
  if (/\.ya?ml$/.test(file)) {
    const r = spawnSync('python3', ['-c', 'import sys,yaml; yaml.safe_load(open(sys.argv[1]))', tmp], { encoding: 'utf8' });
    return r.status === 0 ? null : `🧩 ${file}: YAML non valido`;
  }
  if (/\.(mjs|js)$/.test(file)) {
    const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
    return r.status === 0 ? null : `🧩 ${file}: JavaScript non valido`;
  }
  return null;
}

async function avvisa(testo) {
  console.log(testo);
  const url = process.env.NOTIFY_URL;
  if (!url) return;
  const corpo = process.env.GUARDIA_SQUADRA ? { tipo: 'squadra', nome: 'Guardia', testo: `🛡️ <b>Guardia</b>\n${testo.replace(/&/g, '&amp;').replace(/</g, '&lt;')}`, ok: false }
    : { tipo: 'avviso', nome: 'Guardia', testo };
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-regista-token': process.env.NOTIFY_TOKEN || '' }, body: JSON.stringify(corpo) }).catch((e) => ({ status: e.message }));
  console.log(`bot: ${r.status}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let [prima, dopo] = process.argv.slice(2);
  if (!prima || /^0+$/.test(prima)) prima = `${dopo}~1`;
  const messaggi = git('log', '--format=%h %an: %s%n%b', `${prima}..${dopo}`);
  if (/guardia:\s*ok/i.test(messaggi)) { console.log('guardia: modifica dichiarata voluta (guardia: ok)'); process.exit(0); }
  const cambi = git('diff', '--name-status', '--no-renames', prima, dopo).split('\n').filter(Boolean)
    .map((r) => { const [stato, file] = r.split('\t'); return { stato: stato[0], file }; });
  const problemi = controlla(cambi, { prima: (f) => righe(prima, f), dopo: (f) => righe(dopo, f) });
  for (const { stato, file } of cambi) if (stato !== 'D' && IMPORTANTI.test(file)) { const e = sintassi(file, dopo); if (e) problemi.push(e); }
  if (!problemi.length) { console.log(`guardia: ${cambi.length} file cambiati, tutto a posto`); process.exit(0); }
  const repo = process.env.GITHUB_REPOSITORY || 'repo';
  const chi = messaggi.split('\n').filter((r) => /^[0-9a-f]{6,} /.test(r)).slice(0, 3).map((r) => `• ${r.slice(0, 120)}`).join('\n');
  await avvisa(`Su ${repo} (main) è arrivata una modifica che sembra un danno:\n${problemi.slice(0, 8).join('\n')}\n\nCommit:\n${chi}\n\nNon lanciare montaggi finché non è sistemato: scrivimelo e lo rimetto a posto.`);
  process.exit(1);
}
