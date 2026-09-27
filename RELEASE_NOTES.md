# Claude Agent Viewer 1.2.1

Fixes updating: clicking **Update** closed the app and nothing got installed.

**Install:** download `Claude-Agent-Viewer-1.2.1.msi` and run it. It installs per-user, so there's no admin prompt. Earlier versions can't update themselves to this, so install it by hand once. From 1.2.1 on, updates install by themselves again.

## Fixed
- **Updates now install.** Clicking **Update** (or quitting with an update downloaded) closed the app, but the installer never ran, so the app didn't reopen and stayed on the old version. Now the update installs and the app reopens on the new version. If the installer can't start, the app says so and stays open.

---

# Claude Agent Viewer 1.2.0

Settings and keybinds you can change inside the app, and darker themes in Claude's style. Only the border of the focused tile moves now; the tile behind it stays still.

**Install:** download `Claude-Agent-Viewer-1.2.0.msi` and run it. It installs per-user, so there's no admin prompt. 1.0.0 and later update to this by themselves.

## New
- **Settings** (default `Alt+,`, or the ⚙ in the top bar). Changes apply straight away and are saved. It covers the theme, accent color, wallpaper, border animation and its speed, tile opacity, blur, rounding and gaps, and for the terminal the font, line height, cursor and scrollback. It also has layout defaults, idle-closing timers, and startup and shell options.
- **Keybinds popup** (default `Alt+K`, or the ⌨ in the top bar). Every shortcut in one place. Click **+** and press a key combo to add it, or **✕** to remove one. If a combo is already in use, it moves to the new action.
- **Dark themes:** Obsidian (the new default, near-black), Void (pure black for OLED), Ember, Graphite, and the classic Claude charcoal. You can also pick an accent color.

## Changed
- **Only the border animates.** The moving focus border used to show through the whole tile. Now it stays on the border, and you can limit it to the focused tile or turn it off.
- **`Alt+K` opens the keybinds popup** instead of moving focus up. Use `Alt+Up`, or rebind it in the popup.
- **`config.json` stores only what you've changed**, so future default changes reach you.

---

# Claude Agent Viewer 1.1.0

## New
- **Open in Claude Agent Viewer** in the Explorer right-click menu (folders, folder backgrounds, drives), right under *Open PowerShell window here*.
- **One window:** opening a folder while the viewer is running adds a Claude tile for it instead of starting a second copy.

---

# Claude Agent Viewer 1.0.0

First release.

- Hyprland-style tiling (master and dwindle layouts, workspaces, animated borders) with a Claude theme.
- A master Claude terminal on startup; every subagent opens in its own live tile.
- Idle tiles close themselves; the master and focused tile never do.
- Auto-updates: checks GitHub releases, downloads the new MSI, installs on click or when you quit.
