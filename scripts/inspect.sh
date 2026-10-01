#!/usr/bin/env bash
# Look at a rendered film the way a harsh motion director would.
#
#   inspect.sh sheet  <video> [fps=2] [cols=6]   contact sheet, timestamps burned in → <dir>/contact.png
#   inspect.sh strip  <video> <t> [n=12]         n consecutive frames from t (pops, overlaps) → strip_<t>.png
#   inspect.sh phone  <video>                    1 fps at 360 px wide (readability on a phone) → phone.png
#   inspect.sh seam   <video> [n=6]              last n frames + first n frames (loop seam) → seam.png
#   inspect.sh loop   <video>                    the film twice back to back → loop_check.mp4
#   inspect.sh poster <video> <t>                full-res frame at t → poster.png
#   inspect.sh audio  <video|wav>                integrated loudness + true peak
#   inspect.sh all    <video>                    sheet + phone + seam + loop + poster(at 1/3) + audio
#
# Outputs land next to the video. Open the PNGs and actually look at them.
set -euo pipefail
cmd="${1:-}"; vid="${2:-}"
[ -n "$cmd" ] && [ -n "$vid" ] && [ -f "$vid" ] || { sed -n '2,13p' "$0"; exit 2; }
dir="$(cd "$(dirname "$vid")" && pwd)"
ff() { ffmpeg -y -hide_banner -loglevel error "$@"; }
dur() { ffprobe -v error -show_entries format=duration -of csv=p=0 "$vid"; }
fps_of() { ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 "$vid" | awk -F/ '{printf "%.4f", $1/($2?$2:1)}'; }
width_of() { ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$vid"; }
label="drawtext=text='%{pts\\:hms}':x=6:y=6:fontsize=h/14:fontcolor=white:box=1:boxcolor=black@0.7:boxborderw=4"

sheet() {
  local fps="${1:-2}" cols="${2:-6}" n rows tw
  n=$(awk -v d="$(dur)" -v f="$fps" 'BEGIN{print int(d*f+0.999)}'); rows=$(( (n + cols - 1) / cols ))
  IFS=, read -r w h <<<"$(width_of)"; tw=$([ "$w" -ge "$h" ] && echo 320 || echo 220)
  ff -i "$vid" -vf "fps=$fps,scale=$tw:-2,$label,tile=${cols}x${rows}:padding=4:margin=4:color=0x202020" -frames:v 1 "$dir/contact.png"
  echo "$dir/contact.png"
}
strip() {
  local t="$1" n="${2:-12}"
  ff -ss "$t" -copyts -i "$vid" -vf "scale=320:-2,$label,tile=${n}x1:padding=2" -frames:v 1 "$dir/strip_${t}.png"
  echo "$dir/strip_${t}.png"
}
phone() {
  local n cols=5 rows
  n=$(awk -v d="$(dur)" 'BEGIN{print int(d+0.999)}'); rows=$(( (n + cols - 1) / cols ))
  ff -i "$vid" -vf "fps=1,scale=360:-2,tile=${cols}x${rows}:padding=6:color=0x202020" -frames:v 1 "$dir/phone.png"
  echo "$dir/phone.png"
}
seam() {
  local n="${1:-6}" fr start
  fr=$(fps_of); start=$(awk -v d="$(dur)" -v n="$n" -v f="$fr" 'BEGIN{printf "%.4f", d-n/f}')
  ff -ss "$start" -copyts -i "$vid" -i "$vid" -filter_complex \
    "[0:v]scale=240:-2,$label,tile=${n}x1:padding=2[a];[1:v]trim=end_frame=$n,scale=240:-2,$label,tile=${n}x1:padding=2[b];[a][b]vstack" \
    -frames:v 1 "$dir/seam.png"
  echo "$dir/seam.png   (top row: last $n frames, bottom row: first $n — motion must continue across)"
}
loop() { ff -stream_loop 1 -i "$vid" -c copy "$dir/loop_check.mp4"; echo "$dir/loop_check.mp4"; }
poster() { ff -ss "$1" -i "$vid" -frames:v 1 "$dir/poster.png"; echo "$dir/poster.png"; }
audio() {
  if ! ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$vid" | grep -q .; then echo "audio: none"; return; fi
  ffmpeg -hide_banner -i "$vid" -map 0:a:0 -af ebur128=peak=true -f null - 2>&1 | awk '/Integrated loudness/{f=1} f&&/I:|Peak:/{print "audio:",$0}' | sed 's/  */ /g'
}

case "$cmd" in
  sheet) sheet "${3:-}" "${4:-}" ;;
  strip) [ -n "${3:-}" ] || { echo "strip needs <t>"; exit 2; }; strip "$3" "${4:-}" ;;
  phone) phone ;;
  seam) seam "${3:-}" ;;
  loop) loop ;;
  poster) [ -n "${3:-}" ] || { echo "poster needs <t>"; exit 2; }; poster "$3" ;;
  audio) audio ;;
  all) sheet; phone; seam; loop; poster "$(awk -v d="$(dur)" 'BEGIN{printf "%.2f", d/3}')"; audio ;;
  *) sed -n '2,13p' "$0"; exit 2 ;;
esac
