schemas:
    glib-compile-schemas schemas/

nested:
    XDG_CURRENT_DESKTOP="" GTK_USE_PORTAL=0 NO_AT_BRIDGE=1 dbus-run-session gnome-shell --devkit --wayland --no-x11

zip:
    rm out.zip
    zip out.zip . -r -x ".git/*" -x flake.* -x justfile -x README.md -x schemas/*.compiled

lint:
    shexli out.zip
