# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Denis, the owner, on an iPhone 17 Pro Max (home-screen PWA, Italian UI). He films, uploads the rushes — often on mobile data — and approves or publishes the finished vertical video. Inferred from the request and the app copy: he is the only operator; there is no multi-user audience.

## Product Purpose

Regista turns a folder of rushes into a finished 9:16 montage. The phone app is the remote control: sign in, upload, choose a style, start a montage with an explicit tap, watch the job, then approve, correct, or publish. Success means a montage he asked for, with the rushes safely on R2, and no job started by itself.

## Positioning

The montage runs on his existing regista pipeline (Drive, the worker, GitHub). The PWA does not edit video on the phone except for an optional light proxy. What a generic uploader cannot claim: the same seven pipeline phases he already sees, from install through upload, with resume of parts already accepted by R2.

## Operating Context

Home-screen Safari PWA. Upload is resumable multipart to R2 (8 MB parts, parallel PUTs, IndexedDB of confirmed ETags, screen wake lock). Montage, style study, and publish stay server-side. Copy is Italian. Sign-in is a passkey plus a one-time Telegram code (8 characters, form ABCD-1234).

## Capabilities and Constraints

Confirmed in the client and worker: passkey and Telegram-code login; upload modes originali / solo scelti / copia leggera; montage brief (cartella, stile, sponsor, durata, tono, giudizio, tavola, note); live job phases; approve, captions, Instagram, YouTube, publish, correct, change style, 10 s proof, render only, redo, retry, send the rest; style studio; push. Every montage start stays an explicit tap — nothing automatic or scheduled. Do not change workflows or secrets, and do not deploy beyond the repo’s normal merge pipeline. Service worker cache must bump so an installed PWA loads the new shell.

Inferred, not a new product decision: there is no poster endpoint; covers exist only when a memo already has a Drive file id. Network Information API is absent on iOS Safari.

## Brand Commitments

Name: Regista. Voice: Italian, direct, second person, no marketing tone. Visual commitment from the request: modern Apple Liquid Glass, Grok-like black / graphite / white, glass only on the floating layer, solid graphite if blur fails. System fonts only.

## Evidence on Hand

Working UI in `telegram/app/` (`index.html`, `app.css`, `app.js`, `sw.js`, `manifest.webmanifest`). Design brief and starter tokens were provided as guidance. Refero and Mobbin returned no screens (subscription inactive). Do not invent customers, metrics, or posters.

## Product Principles

- One thumb starts the upload; one explicit tap starts the montage.
- Numbers that matter on mobile data stay visible: progress, speed, parts already safe.
- Status of a running job leads the home screen and updates in place.
- Every existing action remains reachable.
- Glass is navigation, not content, and it must fail solid.

## Accessibility & Inclusion

Touch targets at least 44 pt, safe areas, text at least 16 px in fields, contrast for reading text, reduced motion, reduced transparency, and higher contrast. Italian labels for VoiceOver.
