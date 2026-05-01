'use strict';
const chokidar = require('chokidar');
const path = require('path');
const syncRelay = require('./sync-relay');

const IGNORED = [
  /node_modules/,
  /\.git/,
  /\.leyavi/,
  /preview-v4/,
  /preview\//,
  /device-preview-extension/,
  /\.log$/,
  /feedback\.json$/,
  /feedback-queue\.json$/,
];

function startWatcher(projectRoot) {
  const watcher = chokidar.watch(projectRoot, {
    ignored: IGNORED,
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
  });

  watcher.on('change', (filePath) => {
    const rel = path.relative(projectRoot, filePath);
    console.log(`  ↻ reload → ${rel}`);
    syncRelay.broadcast({ t: 'reload' });
  });

  watcher.on('error', (err) => console.error('Watcher error:', err.message));

  console.log(`  ✓ File watcher activo`);
  return watcher;
}

module.exports = { startWatcher };
