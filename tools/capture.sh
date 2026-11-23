#!/usr/bin/env bash
# Run the game off the desktop in headless gamescope with a private profile and save one frame.
# usage: tools/capture.sh <out.png> [godot args...] [-- game args...]   (--burst=N saves N frames as <out.png>.NNN.png)
set -euo pipefail
export PATH="$HOME/opt/bin:/usr/local/bin:/usr/bin:$PATH"
out=$(realpath -m "$1")
shift
root=$(cd "$(dirname "$0")/.." && pwd)
profile=${CAPTURE_PROFILE:-${TMPDIR:-/tmp}/hfof-capture-profile}
mkdir -p "$profile" "$(dirname "$out")"
pactl list short sinks | rg -q '\sagent_mute\s' || pactl load-module module-null-sink sink_name=agent_mute >/dev/null || true
godot_args=()
game_args=()
seen=0
for a in "$@"; do
	if [ "$a" = "--" ]; then seen=1; elif [ $seen = 0 ]; then godot_args+=("$a"); else game_args+=("$a"); fi
done
exec env -u WAYLAND_DISPLAY -u DISPLAY HOME="$profile" XDG_CONFIG_HOME="$profile/config" XDG_DATA_HOME="$profile/data" \
	XDG_CACHE_HOME="$profile/cache" PULSE_SINK=agent_mute \
	timeout "${CAPTURE_TIMEOUT:-120}" gamescope --backend headless -W "${CAPTURE_W:-1280}" -H "${CAPTURE_H:-720}" \
	-w "${CAPTURE_W:-1280}" -h "${CAPTURE_H:-720}" -- \
	godot --path "$root" --resolution "${CAPTURE_W:-1280}x${CAPTURE_H:-720}" "${godot_args[@]}" -- \
	--capture="$out" "${game_args[@]}"
