// Auto-update from GitHub releases. electron-updater can't update MSI installs, so this
// does it directly: find a newer release, download its .msi, then hand it to msiexec
// (a major upgrade over the installed version) and relaunch.

const { app, net } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const REPO = 'doolecg/claude-agent-viewer';
const CHECK_EVERY_MS = 3 * 60 * 60 * 1000;

function newer(a, b) { // is version a > b
  const pa = a.replace(/^v/, '').split(/[.-]/).map(Number), pb = b.replace(/^v/, '').split(/[.-]/).map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}

function createUpdater({ send, currentVersion = app.getVersion() }) {
  let ready = null;      // { version, file, notes }
  let busy = false;
  let installing = false;

  async function check() {
    if (busy || ready) return;
    busy = true;
    try {
      const res = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
        headers: { 'User-Agent': 'claude-agent-viewer', Accept: 'application/vnd.github+json' },
      });
      if (!res.ok) throw new Error(`GitHub API ${res.status}`);
      const rel = await res.json();
      const version = rel.tag_name.replace(/^v/, '');
      if (!newer(version, currentVersion)) { send('update:status', { state: 'current', version: currentVersion }); return; }
      const asset = rel.assets.find(a => a.name.toLowerCase().endsWith('.msi'));
      if (!asset) return;

      const file = path.join(os.tmpdir(), `ClaudeAgentViewer-${version}.msi`);
      if (!fs.existsSync(file) || fs.statSync(file).size !== asset.size) {
        send('update:status', { state: 'downloading', version });
        const dl = await net.fetch(asset.browser_download_url, { headers: { 'User-Agent': 'claude-agent-viewer' } });
        if (!dl.ok) throw new Error(`download ${dl.status}`);
        const tmp = file + '.part';
        await pipeline(Readable.fromWeb(dl.body), fs.createWriteStream(tmp));
        if (fs.statSync(tmp).size !== asset.size) throw new Error('download size mismatch');
        fs.renameSync(tmp, file);
      }
      ready = { version, file, notes: rel.body || '' };
      send('update:status', { state: 'ready', version, notes: ready.notes, url: rel.html_url });
    } catch (e) {
      send('update:status', { state: 'error', message: String(e.message || e) });
    } finally {
      busy = false;
    }
  }

  // Runs detached so it survives our exit: wait for us to close, install, optionally relaunch.
  function install(relaunch) {
    if (!ready || installing) return false;
    installing = true;
    const exe = process.execPath.replace(/'/g, "''");
    const msi = ready.file.replace(/'/g, "''");
    const script = [
      `Wait-Process -Id ${process.pid} -ErrorAction SilentlyContinue`,
      `$p = Start-Process msiexec.exe -ArgumentList @('/i', '"${msi}"', '${relaunch ? '/passive' : '/qn'}', '/norestart') -Wait -PassThru`,
      relaunch ? `Start-Process -FilePath '${exe}'` : '',
    ].join('; ');
    spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', script], {
      detached: true, stdio: 'ignore', windowsHide: true,
    }).unref();
    return true;
  }

  function start() {
    if (!app.isPackaged && !process.env.CAV_UPDATE_TEST) return;
    setTimeout(check, 5000);
    setInterval(check, CHECK_EVERY_MS);
    // Like electron-updater's autoInstallOnAppQuit: a downloaded update goes in when the app closes.
    app.on('will-quit', () => { if (ready && !installing && app.isPackaged) install(false); });
  }

  return { start, check, install: () => install(true), get ready() { return ready; } };
}

module.exports = { createUpdater, newer };
