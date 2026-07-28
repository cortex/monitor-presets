// Copyright (c) 2026 Joakim Lundborg
// SPDX-License-Identifier: GPL-3.0-or-later

import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import GObject from "gi://GObject";
import St from "gi://St";

import {
  Extension,
  gettext as _,
} from "resource:///org/gnome/shell/extensions/extension.js";

import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

const PresetMenuItem = GObject.registerClass(
  class PresetMenuItem extends PopupMenu.PopupBaseMenuItem {
    _init(preset, callbacks) {
      super._init();

      this._preset = preset;
      this._callbacks = callbacks; // { onActivate, onEdit, onDelete }

      this._descriptionBox = new St.BoxLayout({
        vertical: true,
        x_expand: true,
        style_class: "dimmed",
      });

      this._label = new St.Label({
        text: preset.label,
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
      });
      this._descriptionBox.add_child(this._label);

      this.description = new St.Label({
        text: preset.blob[0][5][0][1],
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
        style_class: "dimmed preset-description",
      });
      this._descriptionBox.add_child(this.description);

      this.add_child(this._descriptionBox);

      const buttonBox = new St.BoxLayout({
        vertical: false,
        y_align: Clutter.ActorAlign.CENTER,
        style_class: "quick-settings-grid",
      });

      this._editIcon = new St.Icon({
        icon_name: "document-edit-symbolic",
        style_class: "popup-menu-icon",
      });
      this._editButton = new St.Button({
        child: this._editIcon,
        style_class: "icon-button",
      });
      this._editButton.connect("clicked", () => this._startEdit());
      buttonBox.add_child(this._editButton);

      this._deleteIcon = new St.Icon({
        icon_name: "edit-delete-symbolic",
        style_class: "popup-menu-icon",
      });
      this._deleteButton = new St.Button({
        child: this._deleteIcon,
        style_class: "icon-button",
      });
      this._deleteButton.connect("clicked", () => {
        this._callbacks.onDelete(this._preset);
      });
      buttonBox.add_child(this._deleteButton);
      this.add_child(buttonBox);

      this.connect("activate", () => {
        this._callbacks.onActivate(this._preset);
      });
    }

    destroy() {
        this._entry?.clutter_text.disconnectObject(this);
        super.destroy();
    }

    _startEdit() {
      this._entry = new St.Entry({
        text: this._preset.label,
        x_expand: true,
        can_focus: true,
      });
      this._editButton.enabled = false;
      this._descriptionBox.remove_child(this._label);
      this._descriptionBox.insert_child_at_index(this._entry, 0);

      this._entry.clutter_text.connectObject(
        "key-focus-out", () => { this._finishEdit(); },
        "activate", () => { this._finishEdit(); });

      this._entry.grab_key_focus();
    }

    _finishEdit() {
      const newLabel = this._entry.get_text().trim();
      if (newLabel && newLabel !== this._preset.label) {
        this._preset.label = newLabel;
        this._callbacks.onEdit(this._preset);
      }

      this._label.text = this._preset.label;
      this._descriptionBox.remove_child(this._entry);
      this._descriptionBox.insert_child_at_index(this._label, 0);
    }
  },
);

const Indicator = GObject.registerClass(
  class Indicator extends PanelMenu.Button {
    _init(settings) {
      super._init(0.0, _("Monitor Presets"));
      this._settings = settings;
      this._settings.connectObject(
        "changed::presets", () => this.setItems(this._loadItems()),
        this,
      );
      this.add_child(
        new St.Icon({
          icon_name: "preferences-desktop-display-symbolic",
          style_class: "system-status-icon",
        }),
      );
      this._presets = [];
      this.setItems(this._loadItems());
      this._rebuildMenu();
    }
    destroy() {
      this._settings.disconnectObject(this);
      super.destroy();
    }
    _rebuildMenu() {
      this.menu.removeAll();
      for (const preset of this._presets) {
        const item = new PresetMenuItem(preset, {
          onActivate: (p) => this._applyPreset(p),
          onEdit: (p) => this._saveEditedPreset(p),
          onDelete: (p) => this._deletePreset(p),
        });
        this.menu.addMenuItem(item);
      }
      const separator = new PopupMenu.PopupSeparatorMenuItem();
      this.menu.addMenuItem(separator);
      const addCurrent = new PopupMenu.PopupImageMenuItem(
        _("Save current"),
        "bookmark-new-symbolic",
        {},
      );

      addCurrent.connect("activate", async () => {
        let setting = await getDisplayState();
        this.addItem("Preset 1", setting);
      });

      this.menu.addMenuItem(addCurrent);
    }

    async _applyPreset(preset) {
      const serial = await getDisplaySerial();
      await applyMonitorConfig(serial, preset, {});
    }

    _saveEditedPreset(preset) {
      const presets = this._loadItems();
      const idx = presets.findIndex((p) => p.id === preset.id); // match by stable id, not label
      if (idx !== -1) {
        presets[idx] = preset;
        this._saveItems(presets);
      }
      this._rebuildMenu();
    }

    _deletePreset(preset) {
      const presets = this._loadItems().filter((p) => p.id !== preset.id);
      this._saveItems(presets);
      this._rebuildMenu();
    }

    setItems(presets) {
      this._presets = presets;
      this._rebuildMenu();
    }

    _loadItems() {
      const raw = this._settings.get_string("presets");
      try {
        return JSON.parse(raw);
      } catch (e) {
        logError(e, "Failed to parse stored items, resetting");
        return [];
      }
    }

    _saveItems(presets) {
      this._settings.set_string("presets", JSON.stringify(presets));
    }

    addItem(label, blob) {
      const items = this._loadItems();
      items.push({ id: GLib.uuid_string_random(), label, blob });
      this._saveItems(items);
    }

    removeItem(index) {
      const items = this._loadItems();
      items.splice(index, 1);
      this._saveItems(items);
    }
  },
);

export default class IndicatorExampleExtension extends Extension {
  enable() {
    this._settings = this.getSettings();
    this._indicator = new Indicator(this._settings);
    Main.panel.addToStatusArea(this.uuid, this._indicator);
  }

  disable() {
    this._indicator.destroy();
    this._indicator = null;
    this._settings = null;
  }
}

async function getDisplayConfig() {
  return await Gio.DBus.session.call(
    "org.gnome.Mutter.DisplayConfig", // Bus name
    "/org/gnome/Mutter/DisplayConfig", // Object path
    "org.gnome.Mutter.DisplayConfig", // Interface name
    "GetCurrentState", // Method name
    null, // Arguments (GLib.Variant)
    null, // Expected return type (null = auto)
    Gio.DBusCallFlags.NONE,
    -1, // Timeout (-1 = default)
    null,
  );
}

async function getDisplaySerial() {
  const result = await getDisplayConfig();
  const [serial, monitors, logicalMonitors, properties] =
    result.recursiveUnpack();
  return serial;
}

async function getDisplayState() {
  try {
    const result = await getDisplayConfig();
    const [serial, monitors, logicalMonitors, properties] =
      result.recursiveUnpack();
    const activeModes = {};
    for (const monitor of monitors) {
      const [spec, modes] = monitor;
      const connector = spec[0];

      for (const mode of modes) {
        const [modeId, width, height, refresh, scale, supportedScales, props] =
          mode;
        if (props && props["is-current"]) {
          activeModes[connector] = modeId;
          break;
        }
      }
    }

    const updatedLogicalMonitors = logicalMonitors.map((logMon) => {
      const [x, y, scale, transform, isPrimary, connectedMonitors, properties] =
        logMon;
      const monitorsForApply = connectedMonitors.map((mon) => {
        const connector = mon[0];
        const modeId = activeModes[connector] || "preferred"; // Fallback till preferred om saknas
        return [connector, modeId, {}];
      });
      return [
        x,
        y,
        scale,
        transform,
        isPrimary,
        monitorsForApply,
        properties || {},
      ];
    });
    return updatedLogicalMonitors;
  } catch (e) {
    console.error("D-Bus call failed:", e);
  }
}

async function applyMonitorConfig(serial, monitors, properties) {
  const params = new GLib.Variant("(uua(iiduba(ssa{sv}))a{sv})", [
    serial,
    2, // method = permanent
    monitors.blob,
    properties || {},
  ]);

  await Gio.DBus.session.call(
    "org.gnome.Mutter.DisplayConfig",
    "/org/gnome/Mutter/DisplayConfig",
    "org.gnome.Mutter.DisplayConfig",
    "ApplyMonitorsConfig",
    params,
    null,
    Gio.DBusCallFlags.NONE,
    -1,
    null,
  );
}
