// Contratto tra il bot (index.ts) e le route dell'app. Il bot resta la fonte dello stato.

export interface Segreti {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_SECRET: string;
  ALLOWED_CHAT_ID: string;
  GITHUB_TOKEN: string;
  GITHUB_REPO: string;
  NOTIFY_TOKEN: string;
  IG_TOKEN?: string;
  APP_SETUP_CODE?: string;
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  DRIVE_CLIENT_ID?: string;
  DRIVE_CLIENT_SECRET?: string;
  DRIVE_REFRESH_TOKEN?: string;
  GEMINI_API_KEY?: string;
  GROQ_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  ASSETS?: { fetch(req: Request): Promise<Response> };
}

export type Imp = {
  versione: 'stabile' | 'beta'; ai: 'gemini' | 'claude'; modello: 'haiku' | 'sonnet' | 'opus';
  gemini: 'flash' | 'pro'; stile: string; prova: 'manuale' | 'auto' | 'no';
};

export type BriefApp = {
  cartella?: string; stile?: string; sponsor?: string; durata?: string; tono?: string;
  giudizio?: string; tavola?: string; note?: string;
};

export type Avvio = {
  cartella?: string; brief?: string; origine?: '97' | '98'; correzione?: string;
  azione?: 'render' | 'regia' | 'archivio'; secondi?: number; r2?: string;
};

export type Giro = {
  id: number; status: string; conclusion: string | null; created_at: string;
  run_started_at?: string; updated_at: string; html_url: string;
};

export type CardApp = {
  nome: string; fasi: Partial<Record<string, string>>; corrente?: string; minuti: number;
  fine?: 'ok' | 'ko'; inCoda?: boolean; prova?: number; soloRender?: boolean;
  correzione?: string; brief?: string; versione?: string;
};

export type PubblicaApp = {
  fileId: string; file?: string; didascalia: string; copertina?: number; copertinaId?: string;
  youtube?: { titolo?: string; descrizione?: string } | null; ig?: boolean; yt?: boolean;
};

export type MemoApp = {
  nome: string; origine?: '97' | '98'; correzione?: string; brief?: string;
  pubblica?: PubblicaApp; pubblicato?: string; azione?: 'render'; secondi?: number;
  stile?: string; approvato?: boolean;
};

export type VideoApp = {
  runId: string; nome: string; file?: string; stile?: string; durata?: number; prova?: number;
  link?: string; runUrl?: string; quando: number;
};

export type PendenteApp = { nome: string; quando: number; secondi?: number; azione?: string };

export type RegiaApp = { nome: string; ok?: boolean; testo?: string; quando: number; attesa?: boolean; runUrl?: string };

export interface Ops {
  chat(env: Segreti): string;
  leggi<T = unknown>(env: Segreti, k: string): Promise<T | undefined>;
  scrivi(env: Segreti, k: string, v: unknown): Promise<void>;
  cancella(env: Segreti, k: string): Promise<void>;
  prepara(env: Segreti): Promise<void>;
  impostazioni(env: Segreti): Promise<Imp>;
  salvaImpostazioni(env: Segreti, imp: Imp): Promise<void>;
  stili(): { nome: string; tasto: string; cosa: string; id?: string; desc?: string }[];
  cartelle(env: Segreti): Promise<{ elenco: string[]; vai: string[]; aggiornato: number } | undefined>;
  richiediElenco(env: Segreti, forza?: boolean): Promise<boolean>;
  lancia(env: Segreti, i: Avvio): Promise<string | null>;
  provaRegia(env: Segreti, cartella: string, brief: string): Promise<string | null>;
  archivia(env: Segreti, cartella: string, r2: string): Promise<string | null>;
  /** Studio dello stile sul video di riferimento intero (workflow stile.yml): errore o null. */
  studiaStile(env: Segreti, r2: string): Promise<string | null>;
  giri(env: Segreti): Promise<Giro[] | string>;
  video(env: Segreti): Promise<VideoApp[]>;
  memo(env: Segreti, runId: string): Promise<MemoApp | undefined>;
  scriviMemo(env: Segreti, runId: string, m: MemoApp): Promise<void>;
  card(env: Segreti, runId: string): Promise<CardApp | undefined>;
  pendenti(env: Segreti): Promise<PendenteApp[]>;
  collegamenti(env: Segreti): Promise<{ ig: boolean; yt?: boolean; prova: Imp['prova']; provaNome: string }>;
  confermaPubblicazione(env: Segreti, runId: string): Promise<string | null>;
  inviaTelegram(env: Segreti, testo: string): Promise<void>;
  nomeStile(nome?: string): string | undefined;
  componiBrief(d: BriefApp, stile: string): string;
  conAltroStile(brief: string | undefined, stile: string): string;
  conStile(brief: string, stile: string): string;
  PROVA_S: number;
  url97: string;
  url98: string;
  regia(env: Segreti): Promise<RegiaApp | undefined>;
}
