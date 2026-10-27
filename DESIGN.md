---
name: Regista
description: Black-glass phone remote for one montage at a time.
colors:
  ink: "#f5f5f7"
  white: "#fff"
  ground: "#000"
  graphite: "#141416"
  graphite-raised: "#1c1c1e"
  graphite-high: "#2a2a2d"
  ink-secondary: "rgba(235, 235, 245, .72)"
  ink-tertiary: "rgba(235, 235, 245, .48)"
  hairline: "rgba(255, 255, 255, .10)"
  hairline-strong: "rgba(255, 255, 255, .18)"
  live: "#30d158"
  amber: "#ffb340"
  fault: "#ff6b6b"
  glass-tint: "rgba(28, 28, 30, .46)"
  glass-sheet: "rgba(24, 24, 26, .72)"
  glass-composer: "rgba(22, 22, 24, .78)"
  glass-solid: "rgba(28, 28, 30, .94)"
  spec-hi: "rgba(255, 255, 255, .34)"
  spec-lo: "rgba(255, 255, 255, .08)"
  scrim: "rgba(0, 0, 0, .5)"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"SF Pro Display\", system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-.022em"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"SF Pro Display\", system-ui, sans-serif"
    fontSize: "1.65rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-.03em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"SF Pro Display\", system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    letterSpacing: "-.03em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"SF Pro Display\", system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.41
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"SF Pro Display\", system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.35
rounded:
  xs: "10px"
  sm: "14px"
  md: "20px"
  lg: "28px"
  xl: "36px"
  pill: "999px"
spacing:
  s1: "4px"
  s2: "8px"
  s3: "12px"
  s4: "16px"
  s5: "20px"
  s6: "24px"
  s8: "32px"
  s10: "40px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "52px"
    width: "100%"
  button-translucent:
    backgroundColor: "rgba(255, 255, 255, .10)"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "52px"
    width: "100%"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "44px"
    width: "100%"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.fault}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "52px"
    width: "100%"
  card:
    backgroundColor: "{colors.graphite}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "20px"
    width: "100%"
  field:
    backgroundColor: "rgba(0, 0, 0, .35)"
    textColor: "{colors.ink}"
    rounded: "16px"
    padding: "14px 16px"
    width: "100%"
  chip-network:
    backgroundColor: "{colors.graphite}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "44px"
  chip-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground}"
    rounded: "18px"
    padding: "10px 14px"
    height: "44px"
  tab-current:
    backgroundColor: "rgba(255, 255, 255, .12)"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    height: "44px"
  orb:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground}"
    rounded: "{rounded.pill}"
    size: "64px"
  sheet:
    backgroundColor: "{colors.glass-sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    width: "460px"
  toast:
    backgroundColor: "{colors.glass-tint}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "12px 16px"
  composer:
    backgroundColor: "{colors.glass-composer}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "10px 12px"
---

# Design System: Regista

## Overview

**Creative North Star: "Vetro Nero"**

Vetro Nero is the remote on a black phone. One job occupies the screen, one white action advances it, and the content under that action stays opaque graphite. The shell is iOS navigation: a large title that collapses into a solid bar, a floating section pill, a sheet, and a white primary. The world supplies the palette, the density, the system face, and the film rail.

Ink white is the only action color. It fills the primary button, the Carica orb, a selected segment, and every rail segment that is already done. Live green, amber, and fault red report state. A job that is actually running is marked by two signatures together: an 8px green live dot that pulses outward, and a light sweep across the current segment of a seven-segment rail. Done segments are solid ink. Warn and error dots stay still. Those two motions belong to a running job.

Glass is a material with four addresses: the dock pill, the sheet, the toast, and the correction composer. Each one is a graphite tint, a blur, and a 1px specular rim. Cards, rows, posters, and the collapsed title bar are opaque. When blur is missing, reduced, or switched off, glass becomes solid graphite. The root type size is 17px. Copy is Italian and sentence case, in the system face.

**Key Characteristics:**

- Black ground, graphite cards, ink white as the only action fill
- Glass only on the dock pill, the sheet, the toast, and the composer, going solid when blur fails
- System face, from a 2rem title to a 13px label
- Seven-segment film rail and a pulsing live dot only while a job runs
- One phone column, pill controls, 44px targets, hairline depth on content

## Colors

The palette is black, three graphites, and a white voice. Chroma shows up only as status.

### Primary

- **Label White** (`ink`, #f5f5f7): Primary text, the primary button, the Carica orb, a selected chip or segment, a done rail segment, and the success disc. Labels on it are black (`ground`).
- **Signal White** (`white`, #fff): The focus ring, the caret, the progress fill, selection text, and the sweep on the current rail segment. Same white voice, reserved for signal rather than fills.

### Neutral

- **Black** (`ground`, #000): The page, the collapsed title bar, the video player, and text on every white action. A quiet white wash sits in the page background: 5% at the top left, 3% at the bottom right.
- **Graphite** (`graphite`, #141416): Cards, grouped settings, the network chip, and the mark tile.
- **Raised Graphite** (`graphite-raised`, #1c1c1e): Flat poster faces, incoming studio bubbles, and the solid glass fallback under increased contrast.
- **High Graphite** (`graphite-high`, #2a2a2d): The upload disc, status chips, file placeholders, and the operator's studio bubble.
- **Secondary Label** (`ink-secondary`, rgba(235, 235, 245, .72)): Supporting lines, notes, quiet buttons, empty states.
- **Tertiary Label** (`ink-tertiary`, rgba(235, 235, 245, .48)): Placeholders, chevrons, elapsed-time figures, inactive phase rows.
- **Hairline** (`hairline`, rgba(255, 255, 255, .10)): The 1px inset edge on cards, groups, and players.
- **Strong Hairline** (`hairline-strong`, rgba(255, 255, 255, .18)): The inset edge on the translucent button, the current tab, fields, and the network chip.
- **Scrim** (`scrim`, rgba(0, 0, 0, .5)): The sheet overlay, fading in over 300ms.

### Status

- **Live Green** (`live`, #30d158): The pulsing live dot while a job runs, the current phase pip, the dock badge, and a published-ready poster pip when the cut is approved.
- **Amber** (`amber`, #ffb340): A waiting poster pip, and a live dot that is warned and therefore still.
- **Fault Red** (`fault`, #ff6b6b): A failed job's dot, rail segment, and message, and the danger button's label.

### Glass tints

- **Dock Tint** (`glass-tint`, rgba(28, 28, 30, .46)): The dock pill and the toast. Blur 18px, saturation 170%, brightness 1.06.
- **Sheet Tint** (`glass-sheet`, rgba(24, 24, 26, .72)): The sheet. Blur 28px.
- **Composer Tint** (`glass-composer`, rgba(22, 22, 24, .78)): The correction composer. Blur 22px.
- **Solid Glass** (`glass-solid`, rgba(28, 28, 30, .94)): The same graphite when blur is unavailable or switched to lite. Reduced transparency uses the same mix at .96. Increased contrast replaces it with Raised Graphite, fully opaque.
- **Specular High** (`spec-hi`, rgba(255, 255, 255, .34)) and **Specular Low** (`spec-lo`, rgba(255, 255, 255, .08)): The 1px rim on glass, bright at the upper left and faint at the lower right.

Increased contrast raises Secondary Label to .92, Tertiary Label to .78, and the hairline to .34, and thickens the card edge to 1.5px at 40% white.

### Named Rules

**The White Action Rule.** Ink white is the only action fill. Live green, amber, and fault red report state. They do not fill a primary button.

**The Opaque Card Rule.** A card is an opaque graphite fill, a faint top wash, and a hairline. Backdrop-filter stays on the floating glass.

## Typography

**Display, headline, title, body, and label** share one stack: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", system-ui, sans-serif. The root size is 17px, so body at 1rem is 17px.

**Character:** iOS system type, tight on titles, regular in the body. Sentence case. No display webfont.

### Hierarchy

- **Display** (700, 2rem, line-height 1.2, tracking -.022em): The large screen title. It collapses away on scroll; the bar then shows the same words at 17px / 600, centered. Detail screens keep that compact title and hide the large one.
- **Headline** (700, 1.65rem, line-height 1.2, tracking -.03em): The phase name and the card title. On a video detail the same role steps down to 1.45rem. A sheet title is 1.3rem / 700 / -.02em. An inline title field is 1.7rem / 700 / -.03em.
- **Title** (700, 22px, tracking -.03em): The in-page section heading, with 22px of space above and 8px below.
- **Body** (400, 1rem, line-height 1.41): Running text and settings rows. Supporting lines use Secondary Label at .94rem (subtitle, max 32ch) or .88rem (meta).
- **Label** (600, 13px, line-height 1.35): Field labels, chips, group labels, notes, and the quiet third line under a job. Dock tabs are the exception, at 10.5px / 600 with tracking .01em. The one-time code field is 20px, centered, uppercase, tracking .18em.

A transfer in progress sets the percent at 2.4rem / 700 / tracking -.04em, tabular, inside the card. That figure is the upload meter, not a second display role.

### Named Rules

**The System Face Rule.** Every role uses the system stack. Titles are sentence case and tracked tight.

**The Tabular Measure Rule.** Percents, bytes, minutes, durations, part counts, and the code field use tabular numerals.

## Layout

The shell is one centered column, `min(100%, 480px)`, fixed to the viewport (`inset: 0`), not sized with `100dvh`. The scrolling view pads 20px on the sides and, at the bottom, the 64px dock plus its offset plus 16px. The top safe area lives on the sticky title row: `env(safe-area-inset-top) + 10px`. The dock offset is `max(10px, env(safe-area-inset-bottom) - 8px)`, so it sits just above the home indicator. A screen with no dock drops the dock clearance. A screen with the composer open adds room for the field and the keyboard offset.

The large title sticks, then yields to a solid black bar once the view has scrolled 24px. Filters under a title stick just below that bar, on black. Settings group labels sit 8px off the group, with more room above the group than inside it. The video catalog is a two-column grid with a 12px gap. Poster strips scroll sideways with snap, inset to the same 20px page margin.

The dock is fixed just above the home indicator (`max(10px, env(safe-area-inset-bottom) - 8px)`), centered, the same width as the column, and leaves the hit area to the pill and the orb. The large title and the trailing control (the Wi-Fi chip on Oggi) share one row. The sheet is centered, at most 460px wide, the same bottom offset as the dock. The toast sits on the top safe area. The composer is at most 480px, 8px above the dock, and rides the keyboard when it is open; the dock then leaves the screen.

At 900px and above the ground stays black and the column stays 480px. There is no second layout.

### Named Rules

**The Phone Column Rule.** One centered column, at most 480px, at every width. The dock matches it. Sheets stop at 460px.

**The Clearance Rule.** The scrolling view clears the status safe area and the floating dock. Content does not sit under the orb.

## Elevation & Depth

Depth is tonal, then a hairline, then a shadow only where something floats. The page is black with two faint white washes. Cards step to graphite with a top wash (5.5% white falling to 2%) and an inset hairline, plus a 1px white sheen at 6% along the top edge. The upload hero adds a second inset edge at 1.5px and 10% white. Nothing in the scrolling view blurs.

The floating layer casts `0 10px 30px rgba(0, 0, 0, .45)` with a 4% white inset sheen. The orb casts `0 8px 24px rgba(0, 0, 0, .5)` and a 70% white inset sheen on its top edge. The sheet scrim is a 50% black veil. A pointer on glass lights a 120px white pool at 16%, under the rim.

### Shadow Vocabulary

- **Hairline** (`0 0 0 1px` hairline inset, plus `0 1px 0 rgba(255, 255, 255, .06)` inset): Cards, groups, the player, and the poster frame.
- **Strong hairline** (`0 0 0 1px` strong-hairline inset): Translucent buttons, the current tab, the upload disc.
- **Float** (`0 10px 30px rgba(0, 0, 0, .45)`, `0 1px 0 rgba(255, 255, 255, .04)` inset): Dock pill, sheet, toast, composer.
- **Orb** (`0 8px 24px rgba(0, 0, 0, .5)`, `0 1px 0 rgba(255, 255, 255, .7)` inset): The Carica orb only.
- **Fault ring** (`0 0 0 1px rgba(255, 107, 107, .55)` inset): A job card that has failed.

### Named Rules

**The Floating Glass Rule.** Glass is the dock pill, the sheet, the toast, and the correction composer. Dock blur is 18px, sheet blur is 28px, composer blur is 22px, with saturation 170% and brightness 1.06. If backdrop-filter is missing, transparency is reduced, or glass is set to lite, the surface becomes solid graphite. Increased contrast uses opaque Raised Graphite and drops the blur. The collapsed title bar is solid black.

**The Hairline Rule.** Content depth is an inset hairline. Soft shadows belong to the orb and the floating glass.

## Shapes

Controls that are tapped as actions are pills: buttons, the dock, tabs, the toast, segments, the network chip, and the send disc. Cards and the player are 28px. Sheets are 36px, with the action bar continuing that radius along the bottom. Grouped settings are 20px. Fields and warning banners are 16px. Style chips, folder chips, and studio bubbles are 18px. Poster faces in the grid are 20px; the small strip faces are 14px; file thumbs are 8px. The rail segment is a 3px radius on a 6px bar (3px tall in the poster strip). The sheet grabber is 36×5px at a 3px radius.

The column is a straight phone, not a rounded device frame. Icons are stroked SVGs in a 24px viewBox, 1.75px stroke, round caps and joins, `currentColor`. The orb and the success check use a 2.2px stroke in black. Empty-state icons are 48px at 1.5px.

### Named Rules

**The Pill Control Rule.** Action controls are pills. Cards are 28px and sheets are 36px. Fields sit between, at 16px.

## Components

Press scales a primary, translucent, quiet, or danger button to 0.97 over 100ms. Disabled buttons drop to 40% opacity. Focus is a 2px signal-white ring, 3px outside the shape. The caret and selection text are signal white; selection fill is white at 22%. The scrollbar thumb is white at 28%.

### Buttons

- **Shape:** Pill (999px). Full width of the column unless it shares a row, where each button flexes equally, or a wrapped action row, where it hugs the label with 14px of side padding and a 44px height.
- **Primary:** Label White fill, black label, 600 weight at 1rem, 52px tall, 22px side padding. The label names the deed: Avvia montaggio, Carica, Approva.
- **Press / Focus:** Scale 0.97 on press. Focus-visible draws the 2px white ring. There is no separate hover color.
- **Translucent:** 10% white fill, Label White text, strong hairline inset. This is the second action (Dettagli, Più tardi, Correggi). It does not blur.
- **Quiet:** Transparent, Secondary Label, 44px tall. Cancel and low-emphasis text actions.
- **Danger:** Transparent, Fault Red label. The destructive confirm.

### Chips

- **Network:** Pill, 44px, graphite fill, strong hairline, 13px / 600, a 16px stroke icon and a word (Dati or Wi-Fi).
- **Style and folder:** 18px radius, 44px, 10% white at rest with a hairline, ink fill and black text when selected. The second line is 12px at 70% opacity.
- **Composer idea:** Pill, 44px, near-solid graphite at 90%, strong hairline, sitting on the glass composer.
- **Status:** Pill, 28px tall, high graphite, 13px / 600, with an 8px pip. Poster pips are amber while waiting, live green when approved, ink when published. They do not pulse.

### Cards / Containers

- **Corner style:** 28px.
- **Background:** Graphite, with the top wash. 20px padding, 12px between cards.
- **Shadow strategy:** Hairline only. A failed job replaces it with the fault ring.
- **Internal padding:** 20px.
- **Running job:** The phase name is the headline, with the live dot on its left and the elapsed minutes, tabular, on its right. Under it, the seven-segment rail, then one tertiary line, then a translucent Dettagli button. The dot is live green and pulses only while that job runs.
- **Upload hero:** At least 220px, centered, a 56px high-graphite disc, then the invitation. A transfer in the same card shows the 2.4rem percent, an 8px track (white at 12%, signal-white fill, 4px radius), and the bytes already safe.
- **Success disc:** 56px ink circle, black check at 2.2px, scaling up from 0.6 with the pop spring when the rushes are safe.
- **Settings group:** Raised as a graphite block at 20px with a hairline. Rows are 52px, 17px text, hairline dividers, chevron in Tertiary Label. The group label above is the 13px label role.

### Inputs / Fields

- **Style:** 16px radius, 16px type, 14×16px padding, 1px strong hairline, black at 35%. Textareas at least 96px tall.
- **Focus:** The global 2px white ring. Caret is signal white. Placeholder is Tertiary Label.
- **Code:** The one-time code is centered, uppercase, 20px, tracking .18em, so the eight characters read as a code.
- **Title field:** Transparent, no border, the 1.7rem headline weight, for the YouTube title on a finished video.
- **Warning banner:** 16px radius, 12×14px padding, an amber wash and an inset amber edge, for a transfer that needs the files chosen again.
- **Studio thread:** Bubbles at 18px radius, max 88% width, Raised Graphite for the reply and High Graphite for Denis. Opaque, not glass.

### Navigation

The dock is a glass pill, 64px tall, 6px padding, at most 300px wide, holding the section tabs, with a 64px ink orb to its right. Tabs are 44px, transparent, Secondary Label, a 24px icon over a 10.5px label. The current tab is Label White, 12% white fill, strong hairline. Oggi carries an 8px live-green badge when work is waiting; the badge is a presence dot. The orb is the upload action, ink fill, black plus at 2.2px. Press scales the orb to 0.92. The back control and the sheet close control are 44px transparent circles with a 22px stroke icon.

### Film rail

Seven columns, 4px gaps, 6px tall, each segment a 3px radius. Waiting segments are white at 14%. Done segments are Label White. A failed segment is Fault Red. The current segment carries a signal-white sweep, 1.6s, linear, looping. On a poster the same rail is 3px tall with 3px gaps. The sweep runs only on the segment of a job that is in progress.

The live dot sits on that job: 8px, live green, a halo that expands to 8px and fades over 1.8s. The warn and error dots use amber and fault red and do not animate. In the phase list, the same seven steps are rows: a still 8px pip (white at 20%, ink when done, live green when current, fault red when failed) and a hairline between rows. The list pip does not pulse. The pulse is the live dot on the running card.

### Sheet, toast, and composer

- **Sheet:** Glass at the sheet tint and 28px blur, 36px radius, a 5px grabber in white at 28%. The title row is 44px. The body scrolls. The action bar is opaque `rgba(18, 18, 20, .96)` with a hairline along its top, so the primary stays readable. It enters with the sheet spring (0.61s).
- **Toast:** Glass pill, dock tint, 12×16px padding, centered under the top safe area.
- **Composer:** Glass at the composer tint and 22px blur, 28px radius, 10×12px padding. Idea chips sit above an opaque field (`rgba(28, 28, 30, .94)`, pill, strong hairline) and a 48px ink send disc.

### Motion

Three springs carry the interface. Snappy (0.39s) is the button and the poster-grid entrance. Sheet (0.61s) is the sheet. Pop (0.59s) is the orb and the success disc. The poster grid's first six cells rise 8px on that snappy spring, staggered by 30ms; that entrance belongs to the grid. Reduced motion, and the in-app effects-off setting, collapse duration and remove animation, including the live-dot pulse and the rail sweep.

### Named Rules

**The Running Job Rule.** A job that is running shows the pulsing green live dot and the sweep on the current segment of the seven-segment rail. Done segments are solid ink. Warn and error dots stay still. Reduced motion and effects-off stop the pulse and the sweep.

**The Second Action Rule.** The second button is a 10% white wash with a strong hairline. It does not blur. Danger is fault-red text. Quiet is secondary-label text at 44px.

## Do's and Don'ts

### Do

- Do fill a primary action with Label White, a black label, a pill, and a 52px height.
- Do keep cards, rows, posters, and the collapsed title on opaque graphite or black, with a 1px hairline.
- Do limit glass to the dock pill, the sheet, the toast, and the composer, and fall back to solid graphite when blur is unavailable, reduced, or set to lite.
- Do mark a running job with the pulsing live dot and the seven-segment rail, done segments in Label White, the current segment sweeping.
- Do keep targets at least 44px, fields at 16px, and counts, bytes, minutes, and durations in tabular numerals.
- Do set every role in the system stack, titles tracked tight and in sentence case.

### Don't

- Don't put backdrop-filter on a card, a row, a poster, or anything else inside the scrolling view.
- Don't fill a primary button with live green, amber, or fault red. Those hues report state.
- Don't load a display webfont. Titles stay in the system stack, sentence case, tracked tight.
- Don't use a zero-blur offset shadow. Content depth is the hairline. The orb and the floating glass are the surfaces that cast a soft shadow.
- Don't pulse a poster pip, sweep an idle rail, or play the success disc on a screen where nothing has just finished.
- Don't stand in icons with emoji. Icons are stroked SVGs at 1.75px, round caps; the orb and the success check are 2.2px.
