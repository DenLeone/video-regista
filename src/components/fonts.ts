import { loadFont as loadSpaceGrotesk } from '@remotion/google-fonts/SpaceGrotesk';
import { loadFont as loadJetBrainsMono } from '@remotion/google-fonts/JetBrainsMono';

export const TITLE_FONT = loadSpaceGrotesk('normal', { weights: ['700'], subsets: ['latin'] }).fontFamily;
export const MONO_FONT = loadJetBrainsMono('normal', { weights: ['700'], subsets: ['latin'] }).fontFamily;

export const ACCENT = '#2EF2B0';
export const DARK = '#0B1014';
