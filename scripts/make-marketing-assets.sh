#!/usr/bin/env bash
#
# Regenerate the Syft Learning 1.0.6 social/marketing image set.
#
#   ./scripts/make-marketing-assets.sh
#
# Source images are the web captures from scripts/capture-web-screenshots.py
# (demo data only, no real children), in docs/marketing/1.0.6/screenshots-web.
# See docs/marketing/1.0.6/assets/README.md for what each image is for.
#
# Requires: ImageMagick 6 (`convert`).  Fonts: DejaVu Sans / DejaVu Sans Bold.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/docs/marketing/1.0.6/screenshots-web"
OUT="$ROOT/docs/marketing/1.0.6/assets"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
mkdir -p "$OUT"

# Brand palette, from front/app.json (splash + adaptive icon) and marketing.html.
BRAND='#0a7ea4'
ACCENT='#00a4c9'
DARK='#052f42'
MUTED='#dff2fa'
BOLD='DejaVu-Sans-Bold'
REG='DejaVu-Sans'

# --- helpers -----------------------------------------------------------------

# bg <w> <h>  -> brand gradient with a soft accent glow, on stdout
bg() {
  # Plain gradient. The accent circle that used to sit in the top-right corner
  # read as a stray UI element rather than decoration, so it is gone.
  convert -size "${1}x${2}" gradient:"$BRAND-$DARK" -depth 8 png:-
}

# phw <src> <height> -> pixel width for a screenshot scaled to <height> tall.
# Read from the file rather than hardcoded, so a capture at a different device
# size cannot silently skew the phone frames. Multiply before dividing: bash
# evaluates left to right, so "h * w / h" is correct where "h * (w / h)" is not.
phw() {
  local dims
  dims=$(identify -format '%w %h' "$1")
  echo $(( $2 * ${dims% *} / ${dims#* } ))
}

# phone <src> <height> <radius>  -> rounded, hairline-bordered screenshot, on stdout
phone() {
  local src=$1 h=$2 r=$3 w
  w=$(phw "$src" "$h")
  convert "$src" -resize "${w}x${h}!" \
    \( -size "${w}x${h}" xc:none -fill white \
       -draw "roundrectangle 0,0,$((w-1)),$((h-1)),${r},${r}" \) \
    -compose CopyOpacity -composite \
    -stroke 'rgba(255,255,255,0.22)' -strokewidth 2 -fill none \
    -draw "roundrectangle 1,1,$((w-2)),$((h-2)),${r},${r}" \
    -depth 8 png:-
}

# cap <wrap-width> <pointsize> <fill> <font> <string>  -> wrapped+trimmed text, on stdout
cap() {
  convert -size "${1}x1600" -background none -fill "$3" -font "$4" \
    -pointsize "$2" -alpha set caption:"$5" -trim -depth 8 png:-
}

# wordmark -> on stdout
wordmark() {
  convert -size 800x160 -background none -fill "$ACCENT" -font "$BOLD" \
    -pointsize 34 -alpha set caption:"SYFT LEARNING" -trim -depth 8 png:-
}

# --- 1. 4:5 cards (Instagram feed, Facebook, Threads) ------------------------
# Left: wordmark + headline + sub. Right: one phone, vertically centred.
card45() { # <src> <headline> <sub> <outfile>
  local src=$1 out=$4
  local W=1080 H=1350 mg=64 txw=430 ty=440 ph=1087 pw
  pw=$(phw "$src" "$ph")
  cap "$txw" 52 white "$BOLD" "$2" > "$T/hl.png"
  local hlh sy
  hlh=$(identify -format '%h' "$T/hl.png")
  sy=$(( ty + hlh + 32 ))
  cap "$txw" 30 "$MUTED" "$REG" "$3" > "$T/sub.png"
  bg $W $H > "$T/bg.png"
  wordmark > "$T/wm.png"
  phone "$src" $ph 42 > "$T/ph.png"
  convert "$T/bg.png" "$T/ph.png" -geometry "+$((W - pw - 52))+$(( (H - ph) / 2 ))" -composite \
          "$T/wm.png" -geometry "+${mg}+84" -composite \
          "$T/hl.png" -geometry "+${mg}+${ty}" -composite \
          "$T/sub.png" -geometry "+${mg}+${sy}" -composite \
          "$out"
}

# --- 2. Wide link cards (X, Bluesky, LinkedIn, Facebook) ---------------------
# Three phones fanned right-to-left, hero (bot editor) on top. Text on the left.
wide() { # <w> <h> <outfile>   -- phones scaled to fit the card height
  local W=$1 H=$2 out=$3
  local mg=$(( W > 1400 ? 72 : 48 ))
  local ph=$(( H * 78 / 100 ))
  local h3 w3 h2 w2 h1 w1
  h3=$(( ph * 88 / 100 )); w3=$(phw "$SRC/06-study.png" "$h3")
  h2=$(( ph * 93 / 100 )); w2=$(phw "$SRC/08-materials.png" "$h2")
  h1=$(( ph * 80 / 100 )); w1=$(phw "$SRC/10-bot-editor.png" "$h1")
  local step=$(( (w1 + w2) / 2 - 120 ))
  bg $W $H > "$T/bg.png"
  wordmark > "$T/wm.png"
  # back to front: 06 (study) -> 08 (materials) -> 10 (bot editor)
  phone "$SRC/06-study.png"       "$h3" 34 > "$T/p3.png"
  phone "$SRC/08-materials.png" "$h2" 34 > "$T/p2.png"
  phone "$SRC/10-bot-editor.png"  "$h1" 34 > "$T/p1.png"
  local x1 x2 x3
  x1=$(( W - w1 - mg )); x2=$(( x1 - step )); x3=$(( x2 - step ))
  local y1=$(( (H - h1) / 2 )) y2=$(( (H - h2) / 2 )) y3=$(( (H - h3) / 2 ))
  cap "$(( W > 1400 ? 620 : 560 ))" $(( W > 1400 ? 60 : 48 )) white "$BOLD" \
      "You see everything. And you set the rules." > "$T/hl.png"
  local hlh sy
  hlh=$(identify -format '%h' "$T/hl.png")
  sy=$(( H / 2 - hlh / 2 - 40 ))
  cap "$(( W > 1400 ? 620 : 560 ))" $(( W > 1400 ? 30 : 24 )) "$MUTED" "$REG" \
      "Free to start. Read every conversation, and write the system prompt yourself." > "$T/sub.png"
  convert "$T/bg.png" \
          "$T/p3.png" -geometry "+${x3}+${y3}" -composite \
          "$T/p2.png" -geometry "+${x2}+${y2}" -composite \
          "$T/p1.png" -geometry "+${x1}+${y1}" -composite \
          "$T/wm.png"  -geometry "+${mg}+$(( mg + 20 ))" -composite \
          "$T/hl.png" -geometry "+${mg}+${sy}" -composite \
          "$T/sub.png" -geometry "+${mg}+$(( sy + hlh + 28 ))" -composite \
          "$out"
}

# --- 3. 9:16 reel cover ------------------------------------------------------
reel() {
  local W=1080 H=1920 out=$1
  local ph=1120 pw
  pw=$(phw "$SRC/06-study.png" "$ph")
  bg $W $H > "$T/bg.png"
  wordmark > "$T/wm.png"
  phone "$SRC/06-study.png" $ph 42 > "$T/ph.png"
  cap 900 74 white "$BOLD" "They learn. You see it all." > "$T/hl.png"
  cap 900 36 "$MUTED" "$REG" "Free to start. \$1 or \$5 a month for more." > "$T/sub.png"
  local hh
  hh=$(identify -format '%h' "$T/hl.png")
  convert "$T/bg.png" \
          "$T/ph.png" -gravity north -geometry "+0+190" -composite \
          "$T/wm.png" -gravity north -geometry "+0+90" -composite \
          "$T/hl.png" -gravity north -geometry "+0+$(( H - hh - 250 ))" -composite \
          "$T/sub.png" -gravity north -geometry "+0+$(( H - 180 ))" -composite \
          "$out"
}

# --- 4. Square builder card (LinkedIn / X) -----------------------------------
square() {
  local W=1200 H=1200 out=$1
  local mg=72 txw=620 ph=904 pw
  pw=$(phw "$SRC/06-study.png" "$ph")
  bg $W $H > "$T/bg.png"
  wordmark > "$T/wm.png"
  phone "$SRC/06-study.png" $ph 42 > "$T/ph.png"
  cap "$txw" 62 white "$BOLD" "A safe AI tutor. \$0 to start." > "$T/hl.png"
  local hlh sy
  hlh=$(identify -format '%h' "$T/hl.png")
  sy=$(( 460 + hlh + 30 ))
  cap "$txw" 30 "$MUTED" "$REG" \
      "Spaced-repetition flashcards, tutor-built study pages, full transcripts, and a system prompt you write yourself." > "$T/sub.png"
  convert "$T/bg.png" \
          "$T/ph.png" -geometry "+$(( W - pw - 64 ))+$(( (H - ph) / 2 ))" -composite \
          "$T/wm.png" -geometry "+${mg}+80" -composite \
          "$T/hl.png" -geometry "+${mg}+460" -composite \
          "$T/sub.png" -geometry "+${mg}+${sy}" -composite \
          "$out"
}

# --- build -------------------------------------------------------------------
# The three parent angles follow the three value propositions: learning,
# parent control, price. They deliberately do NOT lead with "the tutor asks
# questions back", streaks, or one-bot-per-subject.
card45 "$SRC/06-study.png" \
  "Cards that come back when she forgets them." \
  "Spaced repetition, built in." \
  "$OUT/parent-flashcards.png"

card45 "$SRC/08-materials.png" \
  "The tutor builds study pages to come back to." \
  "Made for your student, kept for later." \
  "$OUT/parent-materials.png"

card45 "$SRC/10-bot-editor.png" \
  "You write the system prompt." \
  "Make a character, or a subject expert. You stay in control." \
  "$OUT/parent-control.png"

# Post A3 is the only proposition that does not get its own card: it argues price,
# and the flashcards card carries the educational claim, not a price one. The
# copy says the number outright, so the image does not have to -- but the
# schedule maps A3 to this file, which is why it is named here.

wide 1600 900 "$OUT/og-x-bluesky.png"
wide 1200 630 "$OUT/og-facebook.png"

reel "$OUT/reel-cover.png"
square "$OUT/builder-1.png"

# ImageMagick stamps a png:tIME chunk, which would make every run differ by a few
# bytes and produce a noisy diff. Strip it so re-runs are byte-identical.
for f in "$OUT"/*.png; do
  convert "$f" -strip -define png:exclude-chunk=tIME "$f"
done

echo "Wrote:"
for f in "$OUT"/*.png; do identify -format '  %f  %wx%h\n' "$f"; done
