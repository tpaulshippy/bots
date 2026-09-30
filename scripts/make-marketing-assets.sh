#!/usr/bin/env bash
#
# Regenerate the Syft Learning 1.0.6 social/marketing image set.
#
#   ./scripts/make-marketing-assets.sh
#
# Source images are the App Store screenshots captured by
# scripts/capture-appstore-screenshots.js (demo data only, no real children).
# See docs/marketing/1.0.6/assets/README.md for what each image is for.
#
# Requires: ImageMagick 6 (`convert`).  Fonts: DejaVu Sans / DejaVu Sans Bold.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/docs/app-store/1.0.6/screenshots"
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
  convert -size "${1}x${2}" gradient:"$BRAND-$DARK" \
    \( -size "${1}x${2}" xc:none -fill "$ACCENT" -draw "circle $(($1 - 96)),96 $(($1 - 96)),26" \) \
    -alpha set -compose over -composite -depth 8 png:-
}

# phone <src> <height> <radius>  -> rounded, hairline-bordered screenshot, on stdout
phone() {
  local src=$1 h=$2 r=$3 w
  w=$(( h * 1320 / 2868 ))
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
  pw=$(( ph * 1320 / 2868 ))
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
# Three phones fanned right-to-left, hero (05-chat) on top. Text on the left.
wide() { # <w> <h> <outfile>   -- phones scaled to fit the card height
  local W=$1 H=$2 out=$3
  local mg=$(( W > 1400 ? 72 : 48 ))
  local ph=$(( H * 78 / 100 )) pw
  pw=$(( ph * 1320 / 2868 ))
  local step=$(( pw - 120 ))
  local h3 w3 h2 w2 h1 w1
  h3=$(( ph * 88 / 100 )); w3=$(( h3 * 1320 / 2868 ))
  h2=$(( ph * 93 / 100 )); w2=$(( h2 * 1320 / 2868 ))
  h1=$(( ph * 80 / 100 )); w1=$(( h1 * 1320 / 2868 ))
  bg $W $H > "$T/bg.png"
  wordmark > "$T/wm.png"
  # back to front: 03 (bots) -> 09 (stats) -> 05 (chat)
  phone "$SRC/03-select-bot.png"  "$h3" 34 > "$T/p3.png"
  phone "$SRC/09-stats.png"       "$h2" 34 > "$T/p2.png"
  phone "$SRC/05-chat.png"        "$h1" 34 > "$T/p1.png"
  local x1 x2 x3
  x1=$(( W - w1 - mg )); x2=$(( x1 - step )); x3=$(( x2 - step ))
  local y1=$(( (H - h1) / 2 )) y2=$(( (H - h2) / 2 )) y3=$(( (H - h3) / 2 ))
  cap "$(( W > 1400 ? 620 : 560 ))" $(( W > 1400 ? 60 : 48 )) white "$BOLD" \
      "Parents get the tutor. And the transcript." > "$T/hl.png"
  local hlh sy
  hlh=$(identify -format '%h' "$T/hl.png")
  sy=$(( H / 2 - hlh / 2 - 40 ))
  cap "$(( W > 1400 ? 620 : 560 ))" $(( W > 1400 ? 30 : 24 )) "$MUTED" "$REG" \
      "1.0.6: spaced-repetition flashcards, streaks, a Stats view, and a parent Activity inbox." > "$T/sub.png"
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
  pw=$(( ph * 1320 / 2868 ))
  bg $W $H > "$T/bg.png"
  wordmark > "$T/wm.png"
  phone "$SRC/05-chat.png" $ph 42 > "$T/ph.png"
  cap 900 74 white "$BOLD" "Ask it anything. Watch it teach." > "$T/hl.png"
  cap 900 36 "$MUTED" "$REG" "A safe AI tutor for your kid — from \$0." > "$T/sub.png"
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
  pw=$(( ph * 1320 / 2868 ))
  bg $W $H > "$T/bg.png"
  wordmark > "$T/wm.png"
  phone "$SRC/05-chat.png" $ph 42 > "$T/ph.png"
  cap "$txw" 62 white "$BOLD" "Version 1.0.6 shipped." > "$T/hl.png"
  local hlh sy
  hlh=$(identify -format '%h' "$T/hl.png")
  sy=$(( 460 + hlh + 30 ))
  cap "$txw" 30 "$MUTED" "$REG" \
      "Spaced repetition, streaks, a Stats dashboard, tutor-built study pages, and a parent Activity inbox — all in one release." > "$T/sub.png"
  convert "$T/bg.png" \
          "$T/ph.png" -geometry "+$(( W - pw - 64 ))+$(( (H - ph) / 2 ))" -composite \
          "$T/wm.png" -geometry "+${mg}+80" -composite \
          "$T/hl.png" -geometry "+${mg}+460" -composite \
          "$T/sub.png" -geometry "+${mg}+${sy}" -composite \
          "$out"
}

# --- build -------------------------------------------------------------------
card45 "$SRC/05-chat.png" "She asked. It didn’t hand her the answer." \
  "A tutor that asks back, instead of finishing the homework." \
  "$OUT/parent-fractions.png"

card45 "$SRC/09-stats.png" \
  "It’s not another tab. It’s a streak." \
  "Spaced-repetition flashcards that decide what comes back, and when." \
  "$OUT/parent-streaks.png"

card45 "$SRC/03-select-bot.png" \
  "A tutor per subject." \
  "Math, science, writing, story time — each bot customizable, each one your kid picks." \
  "$OUT/parent-bots.png"

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
