---
name: remotion-regole
description: Regole pratiche di Remotion (animazioni, testi animati, grafici, transizioni, didascalie, audio, video, font, misure del testo). Usala quando scrivi o correggi composizioni Remotion del Regista (src/), per esempio Doc169, gli stili su misura e le grafiche dei documentari.
---

> Fonte: skill «remotion-video-creation» di everything-claude-code (Affaan Mustafa, licenza MIT: vedi LICENSE-ECC), copiata e controllata il 16/11. Solo testo e 3 esempi .tsx: niente hook, niente script.

## Prima le regole di questo progetto
- Le animazioni vanno SOLO da `useCurrentFrame()` (spring/interpolate): niente animazioni CSS o librerie che animano da sole (sfarfallano nel render).
- File del video in `public/` con `staticFile()`; il girato con `<OffthreadVideo>`. Niente `fetch()` di indirizzi esterni dentro le composizioni (render su GitHub, repo pubblico).
- Font con `@remotion/google-fonts` (come in `src/doc169/Doc169.tsx`).
- Prima di aggiungere un pacchetto (`@remotion/transitions`, lottie, three) chiediti se serve davvero: ogni pacchetto rallenta `npm ci` in tutti i giri.
- Nel repo pubblico mai girato, voce o nomi dei video di Denis: prove con video finti (testsrc) e fotogrammi con `npx remotion still`.

## When to use

Use this skills whenever you are dealing with Remotion code to obtain the domain-specific knowledge.

## How to use

Read individual rule files for detailed explanations and code examples:

- [rules/3d.md](rules/3d.md) - 3D content in Remotion using Three.js and React Three Fiber
- [rules/animations.md](rules/animations.md) - Fundamental animation skills for Remotion
- [rules/assets.md](rules/assets.md) - Importing images, videos, audio, and fonts into Remotion
- [rules/audio.md](rules/audio.md) - Using audio and sound in Remotion - importing, trimming, volume, speed, pitch
- [rules/calculate-metadata.md](rules/calculate-metadata.md) - Dynamically set composition duration, dimensions, and props
- [rules/can-decode.md](rules/can-decode.md) - Check if a video can be decoded by the browser using Mediabunny
- [rules/charts.md](rules/charts.md) - Chart and data visualization patterns for Remotion
- [rules/compositions.md](rules/compositions.md) - Defining compositions, stills, folders, default props and dynamic metadata
- [rules/display-captions.md](rules/display-captions.md) - Displaying captions in Remotion with TikTok-style pages and word highlighting
- [rules/extract-frames.md](rules/extract-frames.md) - Extract frames from videos at specific timestamps using Mediabunny
- [rules/fonts.md](rules/fonts.md) - Loading Google Fonts and local fonts in Remotion
- [rules/get-audio-duration.md](rules/get-audio-duration.md) - Getting the duration of an audio file in seconds with Mediabunny
- [rules/get-video-dimensions.md](rules/get-video-dimensions.md) - Getting the width and height of a video file with Mediabunny
- [rules/get-video-duration.md](rules/get-video-duration.md) - Getting the duration of a video file in seconds with Mediabunny
- [rules/gifs.md](rules/gifs.md) - Displaying GIFs synchronized with Remotion's timeline
- [rules/images.md](rules/images.md) - Embedding images in Remotion using the Img component
- [rules/import-srt-captions.md](rules/import-srt-captions.md) - Importing .srt subtitle files into Remotion using @remotion/captions
- [rules/lottie.md](rules/lottie.md) - Embedding Lottie animations in Remotion
- [rules/measuring-dom-nodes.md](rules/measuring-dom-nodes.md) - Measuring DOM element dimensions in Remotion
- [rules/measuring-text.md](rules/measuring-text.md) - Measuring text dimensions, fitting text to containers, and checking overflow
- [rules/sequencing.md](rules/sequencing.md) - Sequencing patterns for Remotion - delay, trim, limit duration of items
- [rules/tailwind.md](rules/tailwind.md) - Using TailwindCSS in Remotion
- [rules/text-animations.md](rules/text-animations.md) - Typography and text animation patterns for Remotion
- [rules/timing.md](rules/timing.md) - Interpolation curves in Remotion - linear, easing, spring animations
- [rules/transcribe-captions.md](rules/transcribe-captions.md) - Transcribing audio to generate captions in Remotion
- [rules/transitions.md](rules/transitions.md) - Scene transition patterns for Remotion
- [rules/trimming.md](rules/trimming.md) - Trimming patterns for Remotion - cut the beginning or end of animations
- [rules/videos.md](rules/videos.md) - Embedding videos in Remotion - trimming, volume, speed, looping, pitch
