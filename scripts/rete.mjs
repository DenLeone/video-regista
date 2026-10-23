// Stime e comandi del caricamento rapido (telefono → R2 → runner, copia su Drive dopo).
// I numeri sono ipotesi dichiarate, non misure sull'account di Denis.

/** Da dove il runner prende il girato. */
export function sorgenteGirato({ r2, telegram } = {}) {
  if (r2) return 'r2';
  if (telegram && telegram !== '[]') return 'telegram';
  return 'drive';
}

/** Secondi per spostare `megabyte` a `megaByteAlSecondo` (MB/s, non Mbit/s). */
export function secondiTrasferimento(megabyte, megaByteAlSecondo) {
  if (!(megabyte > 0) || !(megaByteAlSecondo > 0)) return null;
  return megabyte / megaByteAlSecondo;
}

// Ipotesi volutamente prudenti, scritte anche nel README:
//   telefono → Drive in 4G/5G: 0,6 MB/s (l'app Drive va a un filo e si ferma spesso)
//   telefono → R2, 4 pezzi in parallelo: 2,5 MB/s (5G modesto verso un edge Cloudflare)
//   runner → Drive: 8 MB/s (il log di progetto parla di ~4 min di download su un girato tipico)
//   runner → R2: 40 MB/s (i runner di GitHub spesso fanno di più; 40 è basso di proposito)
export const IPOTESI_RETE = {
  telefonoDrive: 0.6,
  telefonoR2: 2.5,
  runnerDrive: 8,
  runnerR2: 40,
};

export function stimaConfronto(megabyte, ipotesi = IPOTESI_RETE) {
  const telefonoDrive = secondiTrasferimento(megabyte, ipotesi.telefonoDrive);
  const telefonoR2 = secondiTrasferimento(megabyte, ipotesi.telefonoR2);
  const runnerDrive = secondiTrasferimento(megabyte, ipotesi.runnerDrive);
  const runnerR2 = secondiTrasferimento(megabyte, ipotesi.runnerR2);
  return {
    megabyte,
    ipotesi,
    telefono: { drive: telefonoDrive, r2: telefonoR2, risparmio: telefonoDrive - telefonoR2 },
    runner: { drive: runnerDrive, r2: runnerR2, risparmio: runnerDrive - runnerR2 },
  };
}

const ID_R2 = /^[A-Za-z0-9_-]{8,80}$/;
const BUCKET = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

export function comandiScaricoR2({ id, bucket, dest }) {
  if (!ID_R2.test(id)) throw new Error('id R2 non valido');
  if (!BUCKET.test(bucket)) throw new Error('bucket R2 non valido');
  return ['copy', `r2:${bucket}/inbox/${id}`, dest, '--exclude', 'manifest.json', '--transfers', '16', '--multi-thread-streams', '8', '--s3-chunk-size', '16M', '--retries', '5'];
}

export function comandiCopiaDrive(sorgente, destinazione) {
  return ['copy', sorgente, destinazione, '--transfers', '8', '--exclude', 'manifest.json'];
}

export function comandiCancellaR2({ id, bucket }) {
  if (!ID_R2.test(id)) throw new Error('id R2 non valido');
  if (!BUCKET.test(bucket)) throw new Error('bucket R2 non valido');
  return ['purge', `r2:${bucket}/inbox/${id}`];
}

/** Blocco da accodare a rclone.conf. Il segreto finisce solo nel file, mai nei log. */
export function bloccoRemoteR2({ accountId, accessKeyId, secretAccessKey }) {
  if (!/^[a-f0-9]{32}$/.test(accountId || '')) throw new Error('R2_ACCOUNT_ID non valido');
  if (!accessKeyId || !secretAccessKey) throw new Error('mancano le chiavi R2');
  return [
    '[r2]',
    'type = s3',
    'provider = Cloudflare',
    'access_key_id = ' + accessKeyId,
    'secret_access_key = ' + secretAccessKey,
    'endpoint = https://' + accountId + '.r2.cloudflarestorage.com',
    'acl = private',
    'no_check_bucket = true',
    '',
  ].join('\n');
}
