# Claude Agent Viewer

A Hyprland-style tiling window manager for Claude Code on Windows. It opens with a **master** Claude terminal on the left. Every subagent that Claude starts gets its **own tile** as soon as it starts, streaming live, and finished or idle tiles close themselves.

## Install
Download `Claude-Agent-Viewer-<version>.msi` from the [latest release](https://github.com/doolecg/claude-agent-viewer/releases/latest) and run it. It installs per-user, so there's no admin prompt, and adds Start menu and desktop shortcuts. Windows SmartScreen may warn because the installer isn't code-signed: choose *More info → Run anyway*.

**Explorer integration:** right-click any folder, the empty space inside one, or a drive, and choose **Open in Claude Agent Viewer**. It sits right under *Open PowerShell window here*. If the viewer is already running, the folder opens as a new Claude tile in that window. Turn this off with `"explorerContextMenu": false`.

**Auto-updates:** the app checks this repo's latest release at startup and every 3 hours, then downloads the new MSI in the background. When it's ready, an *Update* pill appears in the top bar. Click it to install and restart, or it installs when you quit. Turn this off with `"autoUpdate": false`.

## Develop
```
npm install
npm start          # run from source
npm run dist       # build dist/Claude-Agent-Viewer-<version>.msi
```
To ship a release: `npm version patch && git push --follow-tags`. The `release` workflow builds the MSI and publishes it, and installed copies update themselves.

## How agents show up
Claude Code writes each subagent's transcript to
`~/.claude/projects/<project>/<session>/subagents/agent-*.jsonl`. The viewer watches that folder:

- An agent started from a Claude tile in the viewer opens next to that tile. Each Claude tile is launched with its own `--session-id`, which is how the viewer knows which agents belong to it.
- Agents from Claude sessions running elsewhere (another terminal, your IDE) also show up. Set `showExternalAgents: false` to turn that off.
- Past `maxTilesPerWorkspace`, new agents spill onto the next workspace, and a toast tells you where.

## Idle closing
A tile closes when nothing has happened in it for a while: no output, no typing, no new transcript lines, and you're not looking at it. The badge counts down the last 30 seconds. The focused tile and the master are never closed.

| config key | default |
|---|---|
| `autoCloseDoneAgentsSeconds` | 15 |
| `idleCloseAgentSeconds` | 90 |
| `idleCloseTerminalMinutes` | 10 |

Set any of them to `0` to disable it. A closed Claude session can still be picked up again with `claude --resume`.

## Settings and themes
`Alt+,` (or the ⚙ in the top bar) opens **Settings**. Changes apply straight away and are saved. You can change:

- **Theme:** *Obsidian* (default, near-black), *Void* (pure black for OLED), *Ember*, *Graphite* and the classic *Claude* charcoal, plus an accent color.
- **Look:** wallpaper, the animated border (focused tile and running agents, focused only, or off), its speed, tile opacity and blur, rounding, border width and gaps.
- **Terminal:** font, size, line height, cursor, scrollback.
- **Layout, idle closing and startup:** the options in the table above, plus the default folder, the Claude command and arguments, and the shell.

## Keys (Alt is the "Super" key; Alt+K shows them all)
`Alt+K` (or the ⌨ in the top bar) opens the **keybinds** popup. Hover a row and click **+** to add a key, or **✕** to remove one. A key that's already used moves to the new action.

| | |
|---|---|
| `Alt+Enter` / `Alt+Shift+Enter` | new Claude / new Claude in a folder |
| `Alt+Shift+T` | new PowerShell |
| `Alt+Q` | close tile |
| `Alt+M` / `Alt+Shift+M` | master ⇄ dwindle layout / make focused tile the master |
| `Alt+K` / `Alt+,` | keybinds / settings |
| `Alt+←↑→↓` or `Alt+H`, `Alt+J`, `Alt+L` | move focus |
| `Alt+Shift+arrows` | swap tiles |
| `Ctrl+Alt+arrows` | resize |
| `Alt+F` / `Alt+E` | fullscreen / flip split (dwindle) |
| `Alt+1…9` / `Alt+Shift+1…9` | go to / move tile to workspace |
| `Alt+Shift+A` | close all finished agents |
| `Alt+drag`, `Alt+right-drag`, `Alt+wheel` | swap, resize, switch workspace |

Settings live in `%APPDATA%\Claude Agent Viewer\config.json`, which stores only what you've changed. Settings has an *Open config.json* button.
