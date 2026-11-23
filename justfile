profile := justfile_directory() / ".godot/profile"
godot := "env -u WAYLAND_DISPLAY -u DISPLAY XDG_CONFIG_HOME=" + profile + "/config XDG_DATA_HOME=" + profile + "/data godot"
gut_version := "9.7.1"

# list recipes
default:
    @just --list

# fetch the GUT test addon (not committed)
setup:
    test -d addons/gut || curl -sSL https://github.com/bitwes/Gut/archive/refs/tags/v{{gut_version}}.tar.gz | tar xz --strip-components=1 Gut-{{gut_version}}/addons/gut
    {{godot}} --headless --import

# open the game in a window
run *args:
    godot --path . {{args}}

# run the test suite headless; pass a file to narrow: just test res://tests/test_flowers.gd
test file="": setup
    {{godot}} --headless -s addons/gut/gut_cmdln.gd -gexit {{ if file == "" { "-gdir=res://tests -ginclude_subdirs" } else { "-gtest=" + file } }}

# format GDScript
fmt:
    gdformat --line-length 120 main.gd sim view ui audio tests

# lint GDScript
lint:
    gdformat --line-length 120 --check main.gd sim view ui audio tests
    gdlint main.gd sim view ui audio tests

# save one frame off the desktop: just capture out.png [godot args] [-- game args]
capture out *args:
    tools/capture.sh {{out}} {{args}}

# build the web and Linux releases into build/
export:
    mkdir -p build/web build/linux {{profile}}/data/godot/export_templates
    touch build/.gdignore
    ln -sfn "${XDG_DATA_HOME:-$HOME/.local/share}"/godot/export_templates/* {{profile}}/data/godot/export_templates/
    {{godot}} --headless --export-release Web
    {{godot}} --headless --export-release Linux
