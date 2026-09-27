// Claude Agent Viewer: a Hyprland-style dwindle tiler for Claude terminals and their subagents.

(async () => {
  const cfg = await cav.config();
  const $ = s => document.querySelector(s);
  const desktop = $('#desktop');
  const root = document.documentElement.style;
  root.setProperty('--rounding', cfg.rounding + 'px');
  root.setProperty('--border', cfg.borderSize + 'px');
  root.setProperty('--glass', `rgba(38, 38, 36, ${cfg.opacity})`);

  const WS_COUNT = 9;
  const workspaces = [];       // { el, hint, tree, focused, fullscreen }
  const wins = new Map();      // id -> win
  const sessionWin = new Map();// claude sessionId -> win (to place its subagents next to it)
  const agentWin = new Map();  // agentId -> win
  let current = 0;
  let nextId = 1;
  let lastCwd = cfg.defaultCwd;

  // ------------------------------------------------------------ workspaces

  for (let i = 0; i < WS_COUNT; i++) {
    const el = document.createElement('div');
    el.className = 'workspace' + (i === 0 ? '' : ' right');
    const hint = document.createElement('div');
    hint.className = 'empty-hint';
    hint.innerHTML = `<div class="big">✻</div><div class="headline">What should we build?</div><div>Workspace ${i + 1} is empty</div>
      <div class="row"><span><kbd>${bindLabel('newClaude')}</kbd> new Claude</span>
      <span><kbd>${bindLabel('newClaudeIn')}</kbd> Claude in folder…</span>
      <span><kbd>${bindLabel('help')}</kbd> all keys</span></div>
      <div>Subagents open here in their own tiles as soon as they start.</div>`;
    el.appendChild(hint);
    desktop.appendChild(el);
    workspaces.push({ el, hint, tree: null, focused: null, fullscreen: null, layout: cfg.defaultLayout, mfact: cfg.masterRatio });
  }

  function switchWorkspace(i) {
    if (i === current || i < 0 || i >= WS_COUNT) return;
    workspaces.forEach((w, j) => {
      w.el.classList.toggle('left', j < i);
      w.el.classList.toggle('right', j > i);
    });
    current = i;
    layout(i, true);
    const f = wins.get(workspaces[i].focused);
    if (f) focusWin(f); else refreshBar();
  }

  // ------------------------------------------------------- dwindle tree
  // node: { win } leaf | { split: 'h'|'v', ratio, a, b }. 'h' = side by side.

  const leaves = (n, out = []) => { if (!n) return out; if (n.win) out.push(n); else { leaves(n.a, out); leaves(n.b, out); } return out; };
  const findLeaf = (n, win) => leaves(n).find(l => l.win === win);
  function parentOf(n, target, p = null) {
    if (!n) return null;
    if (n === target) return p;
    if (n.win) return null;
    return parentOf(n.a, target, n) || parentOf(n.b, target, n);
  }
  const wsWins = i => leaves(workspaces[i].tree).map(l => l.win);

  function area() {
    const r = desktop.getBoundingClientRect();
    const g = cfg.gapsOut;
    return { x: g, y: g - 4, w: r.width - 2 * g, h: r.height - 2 * g + 4 };
  }

  function rects(n, r, out = new Map()) {
    if (!n) return out;
    if (n.win) { out.set(n.win.id, r); return out; }
    const gap = cfg.gapsIn * 2;
    if (n.split === 'h') {
      const w1 = (r.w - gap) * n.ratio;
      rects(n.a, { x: r.x, y: r.y, w: w1, h: r.h }, out);
      rects(n.b, { x: r.x + w1 + gap, y: r.y, w: r.w - w1 - gap, h: r.h }, out);
    } else {
      const h1 = (r.h - gap) * n.ratio;
      rects(n.a, { x: r.x, y: r.y, w: r.w, h: h1 }, out);
      rects(n.b, { x: r.x, y: r.y + h1 + gap, w: r.w, h: r.h - h1 - gap }, out);
    }
    return out;
  }

  // Master layout: the first tile in tree order takes the left pane, the rest stack on the right.
  function tileRects(i) {
    const ws = workspaces[i], A = area();
    if (ws.layout !== 'master') return rects(ws.tree, A);
    const list = wsWins(i), out = new Map(), gap = cfg.gapsIn * 2;
    if (list.length === 1) out.set(list[0].id, A);
    if (list.length < 2) return out;
    const mw = (A.w - gap) * ws.mfact;
    out.set(list[0].id, { x: A.x, y: A.y, w: mw, h: A.h });
    const rest = list.slice(1), h = (A.h - gap * (rest.length - 1)) / rest.length;
    rest.forEach((w, k) => out.set(w.id, { x: A.x + mw + gap, y: A.y + k * (h + gap), w: A.w - mw - gap, h }));
    return out;
  }

  function insert(win, wsIndex, target) {
    const ws = workspaces[wsIndex];
    win.ws = wsIndex;
    ws.el.appendChild(win.el);
    const leaf = { win };
    if (!ws.tree) { ws.tree = leaf; return; }
    const tl = (target && target.ws === wsIndex && findLeaf(ws.tree, target)) || findLeaf(ws.tree, wins.get(ws.focused)) || leaves(ws.tree).at(-1);
    const r = rects(ws.tree, area()).get(tl.win.id);
    const split = { split: r.w >= r.h * 0.9 ? 'h' : 'v', ratio: 0.5, a: { win: tl.win }, b: leaf };
    replaceNode(ws, tl, split);
  }

  function replaceNode(ws, node, repl) {
    const p = parentOf(ws.tree, node);
    if (!p) ws.tree = repl; else if (p.a === node) p.a = repl; else p.b = repl;
  }

  function detach(win) {
    const ws = workspaces[win.ws];
    const l = findLeaf(ws.tree, win);
    if (!l) return;
    const p = parentOf(ws.tree, l);
    if (!p) ws.tree = null; else replaceNode(ws, p, p.a === l ? p.b : p.a);
    if (ws.fullscreen === win.id) ws.fullscreen = null;
    if (ws.focused === win.id) ws.focused = null;
  }

  function layout(i = current, instant = false) {
    const ws = workspaces[i];
    const all = tileRects(i);
    const A = area();
    for (const [id, r0] of all) {
      const w = wins.get(id);
      const fs = ws.fullscreen === id;
      const r = fs ? A : r0;
      w.el.classList.toggle('fullscreen', fs);
      w.el.classList.toggle('hidden-by-fs', ws.fullscreen != null && !fs);
      if (instant) w.el.classList.add('no-anim');
      Object.assign(w.el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
      if (instant) { void w.el.offsetWidth; w.el.classList.remove('no-anim'); }
      scheduleFit(w, instant ? 0 : 440);
    }
    ws.hint.style.opacity = ws.tree ? 0 : 1;
    refreshBar();
  }

  function scheduleFit(w, delay) {
    clearTimeout(w.fitTimer);
    w.fitTimer = setTimeout(() => {
      if (!w.alive) return;
      try { w.fit.fit(); } catch {}
      if (w.ptyId) cav.resizePty(w.ptyId, w.term.cols, w.term.rows);
    }, delay);
  }

  // ------------------------------------------------------------- windows

  function makeWin(kind, title) {
    const id = nextId++;
    const el = document.createElement('div');
    el.className = `win ${kind} opening`;
    el.innerHTML = `<div class="inner"><div class="tbar"><span class="ico">${kind === 'claude' ? '✻' : kind === 'agent' ? '◆' : '❯'}</span>
      <span class="title"></span><span class="badge"></span><button class="x" title="Close">✕</button></div><div class="term"></div></div>`;
    const term = new Terminal({
      fontFamily: cfg.fontFamily, fontSize: cfg.fontSize, cursorBlink: kind !== 'agent', allowTransparency: true,
      scrollback: 10000, disableStdin: kind === 'agent', cursorInactiveStyle: 'none', allowProposedApi: true,
      theme: {
        background: 'rgba(0,0,0,0)', foreground: '#f0eee6', cursor: kind === 'agent' ? 'rgba(0,0,0,0)' : '#d97757',
        cursorAccent: '#1f1e1d', selectionBackground: 'rgba(217,119,87,0.3)',
        black: '#2b2a27', red: '#e06c5a', green: '#9cb88a', yellow: '#e3b27a', blue: '#8fa9c7', magenta: '#c89ab8',
        cyan: '#8dbab3', white: '#f0eee6', brightBlack: '#8a857a', brightRed: '#f08a78', brightGreen: '#b4cfa3',
        brightYellow: '#f0c995', brightBlue: '#abc2dc', brightMagenta: '#dcb4ce', brightCyan: '#a9d0ca', brightWhite: '#faf9f5',
      },
    });
    const fit = new FitAddon.FitAddon();
    term.loadAddon(fit);
    const w = { id, kind, el, term, fit, title, alive: true, ws: current, lastActivity: Date.now(), closeIn: null };
    el.querySelector('.title').textContent = title;
    el.querySelector('.x').addEventListener('click', e => { e.stopPropagation(); closeWin(w); });
    el.addEventListener('mousedown', e => onWinMouseDown(e, w), true);
    term.attachCustomKeyEventHandler(e => handleTermKey(e, w));
    wins.set(id, w);
    return w;
  }

  function mount(w, wsIndex, target, { focus = true } = {}) {
    insert(w, wsIndex, target);
    w.term.open(w.el.querySelector('.term'));
    w.term.textarea?.addEventListener('focus', () => { if (workspaces[w.ws].focused !== w.id) focusWin(w, false); });
    // Start at the spot the tile will occupy so it scales in place.
    layout(wsIndex, false);
    // Force a style flush so the scale-in transition runs; rAF would stall while the window is hidden.
    void w.el.offsetWidth;
    w.el.classList.remove('opening');
    if (focus || !workspaces[wsIndex].focused) {
      if (wsIndex !== current && focus) switchWorkspace(wsIndex);
      focusWin(w, focus);
    }
    try { w.fit.fit(); } catch {}
  }

  function setTitle(w, t) { w.title = t; w.el.querySelector('.title').textContent = t; if (w.el.classList.contains('focused')) refreshBar(); }
  function setBadge(w, html) { w.el.querySelector('.badge').innerHTML = html; }

  async function newTerminal(kind, cwd, { master = false } = {}) {
    const w = makeWin(kind, kind === 'claude' ? 'Claude' : 'Shell');
    if (master) { w.master = true; w.el.classList.add('master'); }
    mount(w, current, null);
    const info = await cav.createPty({ kind, cwd: cwd || lastCwd, cols: w.term.cols, rows: w.term.rows });
    w.ptyId = info.id;
    w.sessionId = info.sessionId;
    w.cwd = info.cwd;
    if (info.sessionId) sessionWin.set(info.sessionId, w);
    updateBadge(w);
    setTitle(w, kind === 'claude' ? 'Claude' : 'Shell');
    ptyWins.set(info.id, w);
    w.term.onData(d => { touch(w); cav.writePty(info.id, d); });
    w.term.onTitleChange(t => t && setTitle(w, t));
    scheduleFit(w, 50);
  }

  function shortPath(p) { const parts = p.split(/[\\/]/).filter(Boolean); return parts.slice(-2).join('\\'); }

  function closeWin(w) {
    if (!w.alive) return;
    w.alive = false;
    const wsIndex = w.ws;
    const wasFocused = workspaces[wsIndex].focused === w.id;
    const neighbour = wasFocused ? nearestAfterClose(w) : null;
    detach(w);
    if (w.ptyId) { cav.killPty(w.ptyId); ptyWins.delete(w.ptyId); }
    if (w.sessionId) sessionWin.delete(w.sessionId);
    if (w.agentId) agentWin.delete(w.agentId);
    w.el.classList.add('closing');
    setTimeout(() => { w.term.dispose(); w.el.remove(); }, 320);
    wins.delete(w.id);
    layout(wsIndex);
    if (wasFocused) {
      const n = neighbour || wins.get(wsWins(wsIndex).at(-1)?.id);
      if (n) focusWin(n, wsIndex === current);
    }
    refreshBar();
  }

  function nearestAfterClose(w) {
    const ws = workspaces[w.ws];
    const l = findLeaf(ws.tree, w);
    const p = l && parentOf(ws.tree, l);
    if (!p) return null;
    const sib = p.a === l ? p.b : p.a;
    return leaves(sib)[0]?.win || null;
  }

  function focusWin(w, grabKeyboard = true) {
    if (!w || !w.alive) return;
    const ws = workspaces[w.ws];
    // Looking at a tile counts as activity, so leaving one doesn't make it vanish at once.
    const prev = wins.get(ws.focused);
    if (prev) touch(prev);
    touch(w);
    ws.focused = w.id;
    for (const o of wins.values()) if (o.ws === w.ws) o.el.classList.toggle('focused', o === w);
    if (w.ws !== current) return refreshBar();
    if (grabKeyboard) w.term.focus();
    refreshBar();
  }

  const focused = () => wins.get(workspaces[current].focused);

  // ------------------------------------------------------------- pty data

  const ptyWins = new Map();
  cav.on('pty:data', ({ id, data }) => {
    const w = ptyWins.get(id);
    if (w) { w.lastActivity = Date.now(); w.term.write(data); }
  });
  cav.on('pty:exit', ({ id }) => { const w = ptyWins.get(id); if (w) closeWin(w); });

  // ------------------------------------------------------------- subagents

  cav.on('agent:new', info => {
    if (agentWin.has(info.agentId)) return;
    const parent = sessionWin.get(info.sessionId);
    if (!parent && !cfg.showExternalAgents) return;

    // Keep an agent near whatever spawned it: its Claude tile, or a sibling agent from the same session.
    const sibling = [...agentWin.values()].reverse().find(a => a.sessionId === info.sessionId && a.alive);
    const anchor = parent || sibling || null;
    let wsIndex = anchor ? anchor.ws : current;
    if (wsWins(wsIndex).length >= cfg.maxTilesPerWorkspace) {
      const order = [...Array(WS_COUNT).keys()].map(k => (wsIndex + 1 + k) % WS_COUNT);
      wsIndex = order.find(k => wsWins(k).length < cfg.maxTilesPerWorkspace) ?? wsIndex;
    }
    const target = anchor && anchor.ws === wsIndex ? (sibling && sibling.ws === wsIndex ? sibling : anchor) : null;

    const w = makeWin('agent', info.description);
    Object.assign(w, { agentId: info.agentId, sessionId: info.sessionId, info, status: 'running', state: { first: true, tools: new Map() }, tools: 0 });
    agentWin.set(info.agentId, w);
    mount(w, wsIndex, target, { focus: false });
    w.term.write(AgentRender.header(info));
    updateBadge(w);
    if (wsIndex !== current) toast(`<b>◆ ${esc(info.agentType)}</b> ${esc(info.description)} → workspace ${wsIndex + 1}`, () => { switchWorkspace(wsIndex); focusWin(w); });
    refreshBar();
  });

  cav.on('agent:entries', ({ agentId, entries }) => {
    const w = agentWin.get(agentId);
    if (!w || !w.alive) return;
    let text = '';
    for (const e of entries) {
      text += AgentRender.entry(e, w.state);
      w.tools += e.blocks.filter(b => b.type === 'tool_use').length;
      if (e.role === 'assistant') w.status = e.stop === 'end_turn' ? 'done' : 'running';
      else if (e.blocks.some(b => b.type === 'text')) w.status = 'running';
    }
    if (text) w.term.write(text);
    touch(w);
    if (w.status === 'done' && !w.doneMarked) { w.doneMarked = true; w.term.write('\x1b[38;2;156;184;138m✓ finished\x1b[0m\r\n\r\n'); }
    if (w.status !== 'done') w.doneMarked = false;
    updateBadge(w);
    refreshBar();
  });

  function updateBadge(w) {
    const closing = w.closeIn != null ? ` · closing ${w.closeIn}s` : '';
    if (w.kind !== 'agent') {
      setBadge(w, `${w.master ? 'master · ' : ''}${w.cwd ? shortPath(w.cwd) : ''}${closing}`);
      return;
    }
    w.el.classList.toggle('running', w.status === 'running');
    w.el.classList.toggle('done', w.status === 'done');
    const tools = `${w.tools} tool${w.tools === 1 ? '' : 's'}`;
    if (w.status === 'running') setBadge(w, `<span class="spin">✻</span> ${w.info.agentType} · ${tools}${closing}`);
    else setBadge(w, `✓ done · ${tools}${closing}`);
  }

  // ------------------------------------------------------------ idle reaper
  // A tile closes once nothing has happened in it for its limit: no output, no typing,
  // no transcript lines, and not being looked at. The master and focused tiles are exempt.

  const touch = w => { w.lastActivity = Date.now(); };

  function idleLimit(w) {
    if (w.kind === 'agent') return (w.status === 'done' ? cfg.autoCloseDoneAgentsSeconds : cfg.idleCloseAgentSeconds) * 1000;
    return cfg.idleCloseTerminalMinutes * 60000;
  }

  setInterval(() => {
    const now = Date.now();
    for (const w of [...wins.values()]) {
      const limit = idleLimit(w);
      const isFocused = w.ws === current && workspaces[w.ws].focused === w.id;
      let closeIn = null;
      if (limit && !w.master && !isFocused) {
        const left = limit - (now - w.lastActivity);
        if (left <= 0) { closeWin(w); continue; }
        if (left <= 30000) closeIn = Math.ceil(left / 1000);
      }
      if (closeIn !== w.closeIn) { w.closeIn = closeIn; updateBadge(w); }
    }
  }, 1000);

  // ------------------------------------------------------------ navigation

  function neighbour(dir) {
    const f = focused();
    if (!f) return null;
    const all = tileRects(current);
    const a = all.get(f.id);
    const cx = a.x + a.w / 2, cy = a.y + a.h / 2;
    let best = null, bestScore = Infinity;
    for (const [id, r] of all) {
      if (id === f.id) continue;
      const bx = r.x + r.w / 2, by = r.y + r.h / 2;
      const dx = bx - cx, dy = by - cy;
      const ok = dir === 'Left' ? r.x + r.w <= a.x + 1 : dir === 'Right' ? r.x >= a.x + a.w - 1 : dir === 'Up' ? r.y + r.h <= a.y + 1 : r.y >= a.y + a.h - 1;
      if (!ok) continue;
      const horiz = dir === 'Left' || dir === 'Right';
      const overlap = horiz ? Math.min(a.y + a.h, r.y + r.h) - Math.max(a.y, r.y) : Math.min(a.x + a.w, r.x + r.w) - Math.max(a.x, r.x);
      const score = (horiz ? Math.abs(dx) : Math.abs(dy)) + (overlap > 0 ? 0 : 10000) + (horiz ? Math.abs(dy) : Math.abs(dx)) * 0.1;
      if (score < bestScore) { bestScore = score; best = wins.get(id); }
    }
    return best;
  }

  function swapWith(other) {
    const f = focused();
    if (!f || !other) return;
    swapWins(f, other);
    focusWin(f);
  }

  function swapWins(x, y) {
    if (x.ws !== y.ws) return;
    const ws = workspaces[x.ws];
    const lx = findLeaf(ws.tree, x), ly = findLeaf(ws.tree, y);
    lx.win = y; ly.win = x;
    layout(x.ws);
  }

  function resize(dir) {
    const f = focused();
    if (!f) return;
    const ws = workspaces[current];
    const axis = dir === 'Left' || dir === 'Right' ? 'h' : 'v';
    if (ws.layout === 'master') {
      if (axis === 'h') { ws.mfact = Math.min(0.85, Math.max(0.2, ws.mfact + (dir === 'Right' ? 0.05 : -0.05))); layout(); }
      return;
    }
    let node = findLeaf(ws.tree, f), p;
    while ((p = parentOf(ws.tree, node)) && p.split !== axis) node = p;
    if (!p) return;
    const delta = (dir === 'Right' || dir === 'Down' ? 1 : -1) * 0.05;
    p.ratio = Math.min(0.9, Math.max(0.1, p.ratio + delta));
    layout();
  }

  function toggleSplit() {
    const f = focused();
    if (!f) return;
    const ws = workspaces[current];
    const p = parentOf(ws.tree, findLeaf(ws.tree, f));
    if (p) { p.split = p.split === 'h' ? 'v' : 'h'; layout(); }
  }

  function toggleLayout() {
    const ws = workspaces[current];
    ws.layout = ws.layout === 'master' ? 'dwindle' : 'master';
    toast(`Layout: <b>${ws.layout}</b>`);
    layout();
  }

  // Swap the focused tile into the master slot; it also inherits the idle-proof "master" status.
  function promoteMaster() {
    const f = focused();
    const first = wsWins(current)[0];
    if (!f || !first) return;
    if (f !== first) swapWins(f, first);
    for (const w of wsWins(current)) {
      w.master = w === f && w.kind !== 'agent';
      w.el.classList.toggle('master', w.master);
      updateBadge(w);
    }
    focusWin(f);
  }

  function toggleFullscreen() {
    const f = focused();
    if (!f) return;
    const ws = workspaces[current];
    ws.fullscreen = ws.fullscreen === f.id ? null : f.id;
    layout();
  }

  function moveToWorkspace(i) {
    const f = focused();
    if (!f || i === f.ws) return;
    const from = f.ws;
    detach(f);
    insert(f, i, null);
    workspaces[i].focused = f.id;
    f.el.classList.remove('focused');
    layout(from); layout(i, true);
    const n = wins.get(wsWins(from).at(-1)?.id);
    if (n) focusWin(n);
    refreshBar();
  }

  function closeDoneAgents() {
    for (const w of [...wins.values()]) if (w.kind === 'agent' && w.status === 'done') closeWin(w);
  }

  // ------------------------------------------------------------ mouse

  let drag = null;
  function onWinMouseDown(e, w) {
    if (!w.alive) return;
    if (workspaces[w.ws].focused !== w.id || !w.el.classList.contains('focused')) focusWin(w);
    if (!e.altKey) return;
    e.preventDefault(); e.stopPropagation();
    drag = { w, button: e.button, x: e.clientX, y: e.clientY, target: null };
    if (e.button === 0) w.el.classList.add('dragging');
  }
  window.addEventListener('contextmenu', e => { if (e.altKey) e.preventDefault(); }, true);
  window.addEventListener('mousemove', e => {
    if (!drag) return;
    if (drag.button === 0) {
      const over = document.elementsFromPoint(e.clientX, e.clientY).map(el => el.closest?.('.win')).find(el => el && el !== drag.w.el);
      const tw = over && [...wins.values()].find(o => o.el === over);
      if (drag.target && drag.target !== tw) drag.target.el.classList.remove('drop-target');
      drag.target = tw || null;
      tw?.el.classList.add('drop-target');
    } else if (drag.button === 2) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      const ws = workspaces[drag.w.ws];
      const A = area();
      if (ws.layout === 'master') {
        ws.mfact = Math.min(0.85, Math.max(0.2, ws.mfact + dx / A.w));
        return layout(drag.w.ws, true);
      }
      for (const [axis, d, size] of [['h', dx, A.w], ['v', dy, A.h]]) {
        if (!d) continue;
        let node = findLeaf(ws.tree, drag.w), p;
        while ((p = parentOf(ws.tree, node)) && p.split !== axis) node = p;
        if (p) p.ratio = Math.min(0.9, Math.max(0.1, p.ratio + d / size * 1.6));
      }
      layout(drag.w.ws, true);
    }
  });
  window.addEventListener('mouseup', () => {
    if (!drag) return;
    drag.w.el.classList.remove('dragging');
    if (drag.target) { drag.target.el.classList.remove('drop-target'); swapWins(drag.w, drag.target); }
    drag = null;
  });
  desktop.addEventListener('wheel', e => {
    if (!e.altKey) return;
    e.preventDefault();
    switchWorkspace(Math.min(WS_COUNT - 1, Math.max(0, current + Math.sign(e.deltaY))));
  }, { passive: false });

  // ------------------------------------------------------------ keys

  const norm = code => code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Arrow/, '').replace(/^NumpadEnter$/, 'Enter');
  const MODS = ['Ctrl', 'Alt', 'Shift'];
  const canon = combo => { const p = combo.split('+').map(s => s.trim()); const k = p.pop(); return [...MODS.filter(m => p.includes(m)), k].join('+'); };
  const eventCombo = e => [...(e.ctrlKey ? ['Ctrl'] : []), ...(e.altKey ? ['Alt'] : []), ...(e.shiftKey ? ['Shift'] : []), norm(e.code)].join('+');

  const actions = {
    newClaude: () => newTerminal('claude'),
    newClaudeIn: async () => { const d = await cav.pickFolder(); if (d) { lastCwd = d; newTerminal('claude', d); } },
    newShell: () => newTerminal('shell'),
    close: () => { const f = focused(); if (f) closeWin(f); },
    fullscreen: toggleFullscreen,
    toggleSplit,
    closeDoneAgents,
    toggleLayout,
    promoteMaster,
    focusLeft: () => focusWin(neighbour('Left')), focusRight: () => focusWin(neighbour('Right')),
    focusUp: () => focusWin(neighbour('Up')), focusDown: () => focusWin(neighbour('Down')),
    swapLeft: () => swapWith(neighbour('Left')), swapRight: () => swapWith(neighbour('Right')),
    swapUp: () => swapWith(neighbour('Up')), swapDown: () => swapWith(neighbour('Down')),
    resizeLeft: () => resize('Left'), resizeRight: () => resize('Right'), resizeUp: () => resize('Up'), resizeDown: () => resize('Down'),
    prevWorkspace: () => switchWorkspace(current - 1), nextWorkspace: () => switchWorkspace(current + 1),
    help: () => $('#help').classList.toggle('hidden'),
    openConfig: () => cav.openConfig(),
    devtools: () => cav.devtools(),
  };
  const bindMap = new Map();
  for (const [action, combos] of Object.entries(cfg.keybinds)) for (const c of [].concat(combos)) bindMap.set(canon(c), action);
  for (let i = 1; i <= WS_COUNT; i++) {
    bindMap.set(`Alt+${i}`, `ws${i}`); actions[`ws${i}`] = () => switchWorkspace(i - 1);
    bindMap.set(`Alt+Shift+${i}`, `mv${i}`); actions[`mv${i}`] = () => moveToWorkspace(i - 1);
  }
  function bindLabel(action) { return [].concat(cfg.keybinds[action] || [])[0] || ''; }

  function handleTermKey(e, w) {
    if (e.type !== 'keydown') return true;
    if (bindMap.has(eventCombo(e))) return false;
    // Windows-style clipboard: Ctrl+C copies when there's a selection, Ctrl+V pastes.
    if (e.ctrlKey && !e.altKey && e.code === 'KeyC' && w.term.hasSelection()) {
      navigator.clipboard.writeText(w.term.getSelection()); w.term.clearSelection(); return false;
    }
    if (e.ctrlKey && !e.altKey && e.code === 'KeyV' && w.ptyId) {
      navigator.clipboard.readText().then(t => t && w.term.paste(t)); e.preventDefault(); return false;
    }
    return true;
  }

  window.addEventListener('keydown', e => {
    const action = bindMap.get(eventCombo(e));
    if (e.key === 'Escape' && !$('#help').classList.contains('hidden')) { $('#help').classList.add('hidden'); e.preventDefault(); return; }
    if (!action) return;
    e.preventDefault(); e.stopPropagation();
    if (!e.repeat || action.startsWith('resize')) actions[action]();
  }, true);
  // Stop a lone Alt press from doing anything odd in the frameless window.
  window.addEventListener('keyup', e => { if (e.key === 'Alt') e.preventDefault(); }, true);

  const names = {
    newClaude: 'New Claude terminal', newClaudeIn: 'New Claude in folder…', newShell: 'New shell', close: 'Close tile',
    fullscreen: 'Fullscreen tile', toggleSplit: 'Toggle split direction', closeDoneAgents: 'Close finished agents',
    toggleLayout: 'Master ⇄ dwindle layout', promoteMaster: 'Make focused tile the master',
    focusLeft: 'Focus ←', focusRight: 'Focus →', focusUp: 'Focus ↑', focusDown: 'Focus ↓',
    swapLeft: 'Swap ←', swapRight: 'Swap →', swapUp: 'Swap ↑', swapDown: 'Swap ↓',
    resizeLeft: 'Resize ←', resizeRight: 'Resize →', resizeUp: 'Resize ↑', resizeDown: 'Resize ↓',
    prevWorkspace: 'Previous workspace', nextWorkspace: 'Next workspace', help: 'This help', openConfig: 'Edit config.json', devtools: 'DevTools',
  };
  $('#help-binds').innerHTML = Object.entries(names).map(([a, n]) => `<div class="hb"><span>${n}</span><span>${[].concat(cfg.keybinds[a] || []).map(k => `<kbd>${k}</kbd>`).join(' ')}</span></div>`).join('')
    + `<div class="hb"><span>Go to workspace</span><span><kbd>Alt+1…9</kbd></span></div><div class="hb"><span>Move tile to workspace</span><span><kbd>Alt+Shift+1…9</kbd></span></div>`;
  $('#help').addEventListener('mousedown', e => { if (e.target.id === 'help') $('#help').classList.add('hidden'); });

  // ------------------------------------------------------------ bar

  const wsBar = $('#workspaces');
  function refreshBar() {
    wsBar.innerHTML = '';
    for (let i = 0; i < WS_COUNT; i++) {
      const list = wsWins(i);
      if (i > 4 && !list.length && i !== current) continue;
      const b = document.createElement('button');
      b.className = 'ws-btn' + (i === current ? ' active' : '') + (list.length ? ' occupied' : '')
        + (list.some(w => w.kind === 'agent' && w.status === 'running') ? ' busy' : '');
      b.textContent = i + 1;
      b.onclick = () => switchWorkspace(i);
      wsBar.appendChild(b);
    }
    const f = focused();
    $('#bar-title').textContent = f ? f.title : '';
    const ag = [...wins.values()].filter(w => w.kind === 'agent');
    const run = ag.filter(w => w.status === 'running').length;
    $('#stat-agents').innerHTML = `◆ <span class="run">${run} running</span> · <span class="ok">${ag.length - run} done</span>`;
  }

  function toast(html, onClick) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = html;
    t.onclick = () => { onClick?.(); t.remove(); };
    $('#toasts').appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 5000);
  }
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  const tick = () => { $('#clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
  tick(); setInterval(tick, 10000);
  $('#wc-min').onclick = cav.minimize; $('#wc-max').onclick = cav.maximize; $('#wc-close').onclick = cav.close;

  let resizeT;
  window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => workspaces.forEach((_, i) => layout(i, true)), 60); });

  // ------------------------------------------------------------ updates

  const pill = $('#update-pill');
  const version = await cav.version();
  cav.on('update:status', s => {
    pill.classList.toggle('hidden', s.state !== 'downloading' && s.state !== 'ready');
    pill.classList.toggle('ready', s.state === 'ready');
    if (s.state === 'downloading') { pill.textContent = `↓ Downloading v${s.version}…`; pill.title = ''; }
    if (s.state === 'ready') {
      pill.textContent = `↑ Update to v${s.version}`;
      pill.title = `v${version} → v${s.version}. Click to install and restart (or it installs when you quit).\n\n${s.notes}`;
      toast(`<b>Update ready</b> v${esc(s.version)}. Click the pill in the bar to restart.`);
    }
  });
  pill.onclick = () => { if (pill.classList.contains('ready')) cav.installUpdate(); };

  refreshBar();
  // Opened from Explorer's "Open in Claude Agent Viewer": the master starts in that folder,
  // and later right-clicks (while running) each add a Claude tile there.
  const startDir = await cav.startupFolder();
  if (startDir) lastCwd = startDir;
  if (cfg.masterOnStartup || startDir) newTerminal('claude', startDir || cfg.defaultCwd, { master: true });
  cav.on('open-folder', dir => { lastCwd = dir; newTerminal('claude', dir); });
})();
