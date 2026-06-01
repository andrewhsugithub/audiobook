#!/usr/bin/env bash
# Build all diagrams -> PDF, tight PNG (300 dpi), and 16:9 slide PNG (1920x1080).
set -euo pipefail
cd "$(dirname "$0")"

DIAGRAMS=(workflow storage database)
SLIDE_W=1920
SLIDE_H=1080
FIT="1840x1000>"   # scale to fit inside, leaving a small margin; only shrink

for d in "${DIAGRAMS[@]}"; do
  echo ">> $d.tex"
  if ! pdflatex -interaction=nonstopmode -halt-on-error "$d.tex" > "$d.log" 2>&1; then
    echo "!! pdflatex failed for $d — see $d.log"; tail -n 15 "$d.log"; exit 1
  fi
  pdftocairo -png -r 300 -singlefile "$d.pdf" "$d"                         # -> $d.png (tight)
  convert "$d.png" -resize "$FIT" -background white -gravity center \
          -extent "${SLIDE_W}x${SLIDE_H}" "$d-slide.png"                   # -> $d-slide.png (16:9)
done

echo "== outputs =="
for d in "${DIAGRAMS[@]}"; do
  printf "%-10s pdf=%s  png=%s  slide=%s\n" "$d" \
    "$(identify -format '%wx%h' "$d.pdf"[0] 2>/dev/null || echo '?')" \
    "$(identify -format '%wx%h' "$d.png"      2>/dev/null || echo '?')" \
    "$(identify -format '%wx%h' "$d-slide.png" 2>/dev/null || echo '?')"
done
