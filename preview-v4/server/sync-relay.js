'use strict';
const { WebSocketServer } = require('ws');

class SyncRelay {
  constructor() {
    // deviceId → WebSocket
    this.clients = new Map();
  }

  attach(httpServer) {
    const wss = new WebSocketServer({ server: httpServer, path: '/sync' });

    wss.on('connection', (ws) => {
      let deviceId = null;

      ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }

        // Primer mensaje: registro
        if (msg.t === 'register') {
          deviceId = msg.device;
          this.clients.set(deviceId, ws);
          return;
        }

        // reload se envía a TODOS (incluyendo emisor)
        if (msg.t === 'reload') {
          this.broadcast(msg);
          return;
        }

        // Otros eventos (cl, sc, in, nav): relay a todos excepto emisor
        this.clients.forEach((client, id) => {
          if (id !== deviceId && client.readyState === 1 /* OPEN */) {
            client.send(raw.toString());
          }
        });
      });

      ws.on('close', () => { if (deviceId) this.clients.delete(deviceId); });
      ws.on('error', () => { if (deviceId) this.clients.delete(deviceId); });
    });

    return wss;
  }

  // Envía a todos los clientes conectados
  broadcast(msg) {
    const data = JSON.stringify(msg);
    this.clients.forEach((ws) => {
      if (ws.readyState === 1) ws.send(data);
    });
  }
}

module.exports = new SyncRelay();
