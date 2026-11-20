// 🛡️ Guardia delle chiavi (19/11: le motion graphic di «Skill» erano uscite deboli perché Claude non rispondeva,
// e lo abbiamo scoperto solo dopo il montaggio). Ogni mattina prova, con una domanda piccolissima:
//   - Claude (CLAUDE_CODE_OAUTH_TOKEN, il token dell'abbonamento di Denis);
//   - la chiave Gemini gratuita (GEMINI_API_KEY_GRATIS) e quella a pagamento (GEMINI_API_KEY).
// Avvisa su Telegram SOLO se Denis deve fare qualcosa (token scaduto, chiave rifiutata). Un limite raggiunto si
// azzera da solo: va nel log, niente messaggio. Repo pubblico: nel log solo esiti, mai chiavi.
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function giudicaClaude({ status, stdout = '', stderr = '' }) {
  let j = {};
  try { j = JSON.parse(stdout || '{}'); } catch { /* non JSON */ }
  if (status === 0 && !j.is_error && j.result) return { ok: true };
  const t = `${j.result || ''} ${stderr}`;
  if (/limit|quota|usage/i.test(t)) return { ok: false, limite: true };
  return { ok: false, scaduto: true };
}
export function giudicaGemini(stato) {
  if (stato === 200) return { ok: true };
  if (stato === 429 || stato === 503 || stato === 500) return { ok: false, limite: true };
  return { ok: false, rifiutata: true };
}

async function provaGemini(chiave) {
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': chiave }, signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Rispondi solo: OK' }] }] }),
  }).catch(() => ({ status: 0 }));
  return r.status;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const azioni = [];
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    if (spawnSync('claude', ['--version']).status !== 0) spawnSync('npm', ['install', '-g', '@anthropic-ai/claude-code'], { stdio: 'ignore', timeout: 180_000 });
    const r = spawnSync('claude', ['-p', 'Rispondi solo: OK', '--model', 'haiku', '--output-format', 'json'], { encoding: 'utf8', timeout: 120_000 });
    const g = giudicaClaude(r);
    console.log(`Claude: ${g.ok ? 'ok' : g.limite ? 'limite raggiunto (si azzera da solo)' : 'non risponde'}`);
    if (g.scaduto) azioni.push('🤖 <b>Claude non risponde</b>: il token è scaduto o non vale più. Le animazioni le farà Gemini finché non lo rinnovi.\nSul Mac, nel Terminale: <code>claude setup-token</code> → copia il token → GitHub › video-regista › Settings › Secrets › <code>CLAUDE_CODE_OAUTH_TOKEN</code> › aggiorna.');
  } else azioni.push('🤖 Manca il segreto <code>CLAUDE_CODE_OAUTH_TOKEN</code> su video-regista.');
  for (const [nome, chiave] of [['gratuita', process.env.GEMINI_API_KEY_GRATIS], ['a pagamento', process.env.GEMINI_API_KEY]]) {
    if (!chiave) continue;
    const s = await provaGemini(chiave), g = giudicaGemini(s);
    console.log(`Gemini ${nome}: ${g.ok ? 'ok' : g.limite ? `limite o server occupato (${s})` : `rifiutata (${s})`}`);
    if (g.rifiutata) azioni.push(`🔑 <b>La chiave Gemini ${nome} è rifiutata</b> (${s}). Controlla su Google AI Studio e aggiorna il segreto ${nome === 'gratuita' ? '<code>GEMINI_API_KEY_GRATIS</code>' : '<code>GEMINI_API_KEY</code>'} su video-regista.`);
  }
  if (!azioni.length) { console.log('chiavi: tutto a posto'); process.exit(0); }
  if (process.env.NOTIFY_URL) {
    const r = await fetch(process.env.NOTIFY_URL, { method: 'POST', headers: { 'content-type': 'application/json', 'x-regista-token': process.env.NOTIFY_TOKEN || '' },
      body: JSON.stringify({ tipo: 'avviso', nome: 'Guardia', testo: azioni.join('\n\n').replace(/<[^>]+>/g, '') }) }).catch((e) => ({ status: e.message }));
    console.log(`bot: ${r.status}`);
  }
  process.exit(1);
}
