// Claude Agent Viewer: main process.
// Owns the pseudo-terminals (claude / shell sessions) and watches Claude Code's
// transcript folders so every subagent that starts gets its own tile.

const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const pty = require('@lydell/node-pty');
const { createUpdater } = require('./updater');
const shellIntegration = require('./shell-integration');

const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
// Lives in %APPDATA%/Claude Agent Viewer so it survives updates (the install dir is replaced).
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

// Alt is the "Super" key here: Windows reserves most Win+ combos for itself.
const DEFAULT_KEYBINDS = {
  newClaude: ['Alt+Enter'],
  newClaudeIn: ['Alt+Shift+Enter'],
  newShell: ['Alt+Shift+T'],
  close: ['Alt+Q'],
  fullscreen: ['Alt+F'],
  toggleSplit: ['Alt+E'],
  closeDoneAgents: ['Alt+Shift+A'],
  toggleLayout: ['Alt+M'],
  promoteMaster: ['Alt+Shift+M'],
  focusLeft: ['Alt+Left', 'Alt+H'], focusRight: ['Alt+Right', 'Alt+L'],
  focusUp: ['Alt+Up', 'Alt+K'], focusDown: ['Alt+Down', 'Alt+J'],
  swapLeft: ['Alt+Shift+Left', 'Alt+Shift+H'], swapRight: ['Alt+Shift+Right', 'Alt+Shift+L'],
  swapUp: ['Alt+Shift+Up', 'Alt+Shift+K'], swapDown: ['Alt+Shift+Down', 'Alt+Shift+J'],
  resizeLeft: ['Ctrl+Alt+Left'], resizeRight: ['Ctrl+Alt+Right'],
  resizeUp: ['Ctrl+Alt+Up'], resizeDown: ['Ctrl+Alt+Down'],
  prevWorkspace: ['Alt+PageUp'], nextWorkspace: ['Alt+PageDown'],
  help: ['F1', 'Alt+Slash'],
  openConfig: ['Alt+Comma'],
  devtools: ['Ctrl+Shift+I'],
  // Alt+1..9 switch workspace, Alt+Shift+1..9 move the focused tile there.
};

const DEFAULT_CONFIG = {
  defaultCwd: os.homedir(),
  claudeCommand: 'claude',
  claudeArgs: [],
  shell: 'powershell.exe',
  showExternalAgents: true,       // agents from Claude sessions not started inside the viewer
  agentLookbackSeconds: 20,       // on startup, also open agents that started this recently
  masterOnStartup: true,          // open a Claude "master" terminal when the viewer starts
  defaultLayout: 'master',        // 'master' (big left pane + stack) or 'dwindle'
  masterRatio: 0.55,
  // Idle reaping (0 disables each). The focused tile and the master terminal are never reaped.
  autoCloseDoneAgentsSeconds: 15, // finished agent tiles
  idleCloseAgentSeconds: 90,      // agent tiles whose transcript has gone quiet without finishing
  idleCloseTerminalMinutes: 10,   // Claude/shell tiles with no output and no typing
  maxTilesPerWorkspace: 6,        // new agents spill onto the next workspace past this
  gapsIn: 5,
  gapsOut: 12,
  rounding: 12,
  borderSize: 2,
  fontSize: 13,
  fontFamily: "'Cascadia Mono', 'Cascadia Code', Consolas, monospace",
  opacity: 0.86,
  autoUpdate: true,               // check GitHub releases and install new versions
  explorerContextMenu: true,      // "Open in Claude Agent Viewer" when right-clicking a folder
  keybinds: DEFAULT_KEYBINDS,
};

function loadConfig() {
  let user = {};
  try { user = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch {}
  const cfg = { ...DEFAULT_CONFIG, ...user, keybinds: { ...DEFAULT_KEYBINDS, ...(user.keybinds || {}) } };
  if (!fs.existsSync(CONFIG_PATH)) {
    try { fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true }); fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2)); } catch {}
  }
  return cfg;
}

const config = loadConfig();
let win = null;
const send = (ch, data) => { if (win && !win.isDestroyed()) win.webContents.send(ch, data); };

// ---------------------------------------------------------------- terminals

const ptys = new Map(); // id -> pty

ipcMain.handle('config', () => config);

// A folder passed on the command line (e.g. from the Explorer right-click entry).
function folderArg(argv) {
  const args = argv.slice(app.isPackaged ? 1 : 2).filter(a => !a.startsWith('-'));
  for (const a of args) {
    const dir = a.replace(/"/g, '');
    try { if (fs.statSync(dir).isDirectory()) return path.resolve(dir); } catch {}
  }
  return null;
}
const startupFolder = folderArg(process.argv);
ipcMain.handle('startup-folder', () => startupFolder);

ipcMain.handle('pty:create', (_e, { kind, cwd, cols, rows }) => {
  const id = crypto.randomUUID();
  const sessionId = kind === 'claude' ? crypto.randomUUID() : null;
  const dir = cwd && fs.existsSync(cwd) ? cwd : config.defaultCwd;

  // Run claude through the shell (PATH lookup, .cmd shims). The tile closes when claude
  // exits cleanly; on failure it waits so the error stays readable.
  let command = config.shell;
  let args = ['-NoLogo'];
  if (kind === 'claude') {
    const quoted = [...config.claudeArgs, '--session-id', sessionId].map(a => `'${String(a).replace(/'/g, "''")}'`).join(' ');
    args = ['-NoLogo', '-Command', `& ${config.claudeCommand} ${quoted}; if (-not $?) { Read-Host 'claude exited with an error, press Enter to close' }`];
  }

  // If the viewer was itself started from inside a Claude session, don't let the
  // child claude think it's nested: that turns off transcript saving, which the
  // agent tiles depend on.
  const env = { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' };
  for (const k of Object.keys(env)) {
    if (k === 'CLAUDECODE' || k === 'CLAUDE_PID' || /^CLAUDE_CODE_(CHILD_SESSION|ENTRYPOINT|SESSION_|BRIDGE_|MESSAGING_)/.test(k)) delete env[k];
  }

  const p = pty.spawn(command, args, {
    name: 'xterm-256color',
    cols: cols || 100,
    rows: rows || 30,
    cwd: dir,
    env,
    useConpty: true,
  });
  ptys.set(id, p);
  p.onData(data => send('pty:data', { id, data }));
  p.onExit(({ exitCode }) => { ptys.delete(id); send('pty:exit', { id, exitCode }); });
  return { id, sessionId, cwd: dir };
});

ipcMain.on('pty:write', (_e, { id, data }) => ptys.get(id)?.write(data));
ipcMain.on('pty:resize', (_e, { id, cols, rows }) => {
  try { if (cols > 1 && rows > 1) ptys.get(id)?.resize(cols, rows); } catch {}
});
ipcMain.on('pty:kill', (_e, { id }) => { try { ptys.get(id)?.kill(); } catch {} ptys.delete(id); });

ipcMain.handle('pick-folder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'], defaultPath: config.defaultCwd });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.on('open-config', () => shell.openPath(CONFIG_PATH));
ipcMain.on('win:minimize', () => win?.minimize());
ipcMain.on('win:maximize', () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()));
ipcMain.on('win:close', () => win?.close());
ipcMain.on('devtools', () => win?.webContents.toggleDevTools());

// ------------------------------------------------------------------ updates

const updater = createUpdater({ send });
ipcMain.handle('app:version', () => app.getVersion());
ipcMain.on('update:check', () => updater.check());
ipcMain.on('update:install', () => { if (updater.install()) app.quit(); });

// ---------------------------------------------------------- subagent watcher
// Layout on disk: projects/<project>/<sessionId>/subagents/agent-<id>.jsonl (+ .meta.json)

const agents = new Map(); // agentId -> { file, offset, partial, done, lastActivity }
const startTime = Date.now();

function readMeta(file) {
  try { return JSON.parse(fs.readFileSync(file.replace(/\.jsonl$/, '.meta.json'), 'utf8')); } catch { return null; }
}

function considerAgentFile(file) {
  const base = path.basename(file);
  if (!/^agent-.+\.jsonl$/.test(base)) return;
  const agentId = base.slice(6, -6);
  if (agents.has(agentId)) return;
  let st;
  try { st = fs.statSync(file); } catch { return; }
  const fresh = st.birthtimeMs > startTime - config.agentLookbackSeconds * 1000
    || st.mtimeMs > startTime - config.agentLookbackSeconds * 1000;
  const a = { agentId, file, offset: 0, partial: '', announced: false, lastSize: -1 };
  agents.set(agentId, a);
  if (!fresh) { a.ignored = true; return; }

  const sessionDir = path.dirname(path.dirname(file));
  a.sessionId = path.basename(sessionDir);
  a.project = path.basename(path.dirname(sessionDir));
  tailAgent(a);
}

function tailAgent(a) {
  if (a.ignored) return;
  let st;
  try { st = fs.statSync(a.file); } catch { return; }
  if (!a.announced) {
    const meta = readMeta(a.file);
    // meta.json can land a moment after the transcript; wait briefly for it.
    if (!meta && Date.now() - st.birthtimeMs < 1500) return;
    a.announced = true;
    send('agent:new', {
      agentId: a.agentId, sessionId: a.sessionId, project: a.project,
      agentType: meta?.agentType || 'agent', description: meta?.description || a.agentId,
      spawnDepth: meta?.spawnDepth || 1,
    });
  }
  if (st.size === a.lastSize) return;
  a.lastSize = st.size;
  if (st.size < a.offset) a.offset = 0;
  const fd = fs.openSync(a.file, 'r');
  try {
    const len = st.size - a.offset;
    if (len <= 0) return;
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, a.offset);
    a.offset = st.size;
    const text = a.partial + buf.toString('utf8');
    const lines = text.split('\n');
    a.partial = lines.pop();
    const entries = [];
    for (const l of lines) {
      if (!l.trim()) continue;
      try { entries.push(JSON.parse(l)); } catch {}
    }
    if (entries.length) send('agent:entries', { agentId: a.agentId, entries: entries.map(slimEntry).filter(Boolean) });
  } finally { fs.closeSync(fd); }
}

// Strip transcript lines down to what the renderer draws.
function slimEntry(o) {
  if (o.type !== 'user' && o.type !== 'assistant') return null;
  const c = o.message?.content;
  const blocks = typeof c === 'string' ? [{ type: 'text', text: c }] : Array.isArray(c) ? c : [];
  return {
    role: o.type,
    stop: o.message?.stop_reason || null,
    blocks: blocks.map(b => {
      if (b.type === 'text') return { type: 'text', text: b.text };
      if (b.type === 'thinking') return b.thinking ? { type: 'thinking', text: b.thinking } : null;
      if (b.type === 'tool_use') return { type: 'tool_use', id: b.id, name: b.name, input: b.input };
      if (b.type === 'tool_result') {
        const t = typeof b.content === 'string' ? b.content
          : Array.isArray(b.content) ? b.content.map(x => x.text || (x.type === 'image' ? '[image]' : '')).join('\n') : '';
        return { type: 'tool_result', id: b.tool_use_id, text: t.slice(0, 4000), isError: !!b.is_error };
      }
      return null;
    }).filter(Boolean),
  };
}

function scanAll() {
  let projects;
  try { projects = fs.readdirSync(PROJECTS_DIR); } catch { return; }
  for (const p of projects) {
    const pdir = path.join(PROJECTS_DIR, p);
    let sessions;
    try { sessions = fs.readdirSync(pdir, { withFileTypes: true }); } catch { continue; }
    for (const s of sessions) {
      if (!s.isDirectory()) continue;
      const sub = path.join(pdir, s.name, 'subagents');
      let files;
      try { files = fs.readdirSync(sub); } catch { continue; }
      for (const f of files) considerAgentFile(path.join(sub, f));
    }
  }
}

function startWatcher() {
  scanAll();
  try {
    fs.watch(PROJECTS_DIR, { recursive: true }, (_ev, rel) => {
      if (!rel || !rel.includes('subagents')) return;
      const full = path.join(PROJECTS_DIR, rel);
      if (full.endsWith('.jsonl')) {
        const id = path.basename(full).slice(6, -6);
        const a = agents.get(id);
        if (a) tailAgent(a); else considerAgentFile(full);
      }
    });
  } catch (e) { console.error('watch failed, polling only', e); }
  // fs.watch can coalesce or miss appends on Windows; poll as a backstop.
  setInterval(() => { for (const a of agents.values()) tailAgent(a); }, 400);
  setInterval(scanAll, 3000);
}

// --------------------------------------------------------------------- app

function createWindow() {
  win = new BrowserWindow({
    width: 1600, height: 950, minWidth: 700, minHeight: 450,
    frame: false,
    backgroundColor: '#1a1918',
    title: 'Claude Agent Viewer',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.once('did-finish-load', () => {
    startWatcher();
    if (config.autoUpdate) updater.start();
  });
}

// One window: launching again (say from Explorer) opens a Claude tile in the running one.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    const dir = folderArg(argv);
    if (dir) send('open-folder', dir);
  });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    createWindow();
    if (app.isPackaged) {
      if (config.explorerContextMenu) shellIntegration.register(process.execPath);
      else shellIntegration.unregister();
    }
  });
}
app.on('window-all-closed', () => {
  for (const p of ptys.values()) { try { p.kill(); } catch {} }
  app.quit();
});
