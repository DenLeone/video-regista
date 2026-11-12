// Cartelle di Drive del progetto (percorsi dal Drive di Denis, remote rclone "gdrive").
// Riorganizzate da Denis il 20/10: prima erano 97 - Editare, 98 - Fatti, 99 - Pubblicare e
// 03 · Social — Risorse/Stili. Se cambiano di nome: qui e nell'env dei workflow
// (.github/workflows/*.yml, stesse variabili), che vince sui valori scritti qui.
export const DIR_EDITARE = process.env.DIR_EDITARE || '01 · Da editare';
export const DIR_FATTI = process.env.DIR_FATTI || '02 · Fatti';
export const DIR_PUBBLICARE = process.env.DIR_PUBBLICARE || '03 · Da pubblicare';
export const DIR_STILI = process.env.DIR_STILI || '12 · Risorse/Stili';
// libreria di Denis (03/11): Loghi/ (PNG trasparenti col nome della marca), Fonts/, elementi…
export const DIR_ASSETS = process.env.DIR_ASSETS || '12 · Risorse/Assets';
// suoni (12/11): il pack a pagamento, la grande libreria e la tassonomia curata. Restano su Drive:
// il Regista li scarica sul runner a ogni montaggio (scripts/suoni-veri.mjs), mai nel repo
export const DIR_SFX = process.env.DIR_SFX || '12 · Risorse/SFX — regista';
