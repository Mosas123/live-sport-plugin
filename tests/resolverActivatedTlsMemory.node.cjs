'use strict';
// HTTPS server + installed Undici over in-memory streams. No real listener.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const tls = require('node:tls');
const net = require('node:net');
const http = require('node:http');
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { Duplex, PassThrough } = require('node:stream');
const { createPinnedResolverUnixClients } = require('../src/services/ResolverUnixClients');

test('activated TLS credentials and the pinned cache client interoperate in memory', async () => {
  const { systemdTlsOptions } = await import('../resolver/src/systemdTls.js');
  const fixture = path.join(__dirname, 'fixtures/guarded-tls');
  const cert = fs.readFileSync(path.join(fixture, 'cert.pem'));
  const key = fs.readFileSync(path.join(fixture, 'key.pem'));
  const options = systemdTlsOptions({ RESOLVER_SYSTEMD_TLS: 'true', CREDENTIALS_DIRECTORY: '/run/credentials/test' }, 3,
    file => file.endsWith('resolver.crt') ? cert : key);
  const requests = [], streams = [];
  const server = https.createServer(options, (req, res) => { requests.push(req.url); res.setHeader('connection', 'close'); res.end('ok'); });
  const oldTls = tls.connect, oldNet = net.connect;
  let destination;
  net.connect = () => { throw new Error('unexpected network access'); };
  tls.connect = opts => {
    destination = opts.path;
    const a = new PassThrough(), b = new PassThrough();
    const client = Duplex.from({ readable: b, writable: a });
    const peer = Duplex.from({ readable: a, writable: b });
    for (const stream of [a, b, client, peer]) { stream.on('error', () => {}); streams.push(stream); }
    peer.setTimeout = peer.setNoDelay = peer.setKeepAlive = () => peer;
    const socket = oldTls({ ...opts, socket: client });
    setImmediate(() => server.emit('connection', peer));
    return socket;
  };
  const clients = createPinnedResolverUnixClients({ socketPath: '/run/nuvio-test/resolver.sock', legacyPort: 7004,
    tlsIdentity: { certificatePem: cert.toString(), expectedHost: 'cdn.example.org' } });
  try {
    const response = await clients.request('http://127.0.0.1:7004/api/cache/key', { signal: AbortSignal.timeout(3000) });
    assert.equal(await response.text(), 'ok');
    assert.deepEqual(requests, ['/api/cache/key']);
    assert.equal(destination, '/run/nuvio-test/resolver.sock');
    const app = express();
    app.use('/api', createProxyMiddleware({ ...clients.proxyOptions, changeOrigin: false, xfwd: true,
      logger: { info() {}, warn() {}, error() {} }, on: { error() {} } }));
    const publicServer = http.createServer(app);
    const inbound = new PassThrough(), outbound = new PassThrough();
    const inboundSocket = Duplex.from({ readable: inbound, writable: outbound });
    for (const stream of [inbound, outbound, inboundSocket]) { stream.on('error', () => {}); streams.push(stream); }
    const raw = await new Promise((resolve, reject) => {
      let data = '';
      const timer = setTimeout(() => reject(new Error('proxy test timeout')), 3000);
      outbound.on('data', chunk => { data += chunk.toString(); });
      outbound.on('end', () => { clearTimeout(timer); resolve(data); });
      publicServer.emit('connection', inboundSocket);
      inbound.write('GET /api/stream HTTP/1.1\r\nHost: client.example\r\nConnection: close\r\n\r\n');
    });
    assert.match(raw, /^HTTP\/1\.1 200 /);
    assert.deepEqual(requests, ['/api/cache/key', '/api/stream']);
    publicServer.close();
  } finally {
    await clients.close();
    for (const stream of streams) stream.destroy();
    server.close(); tls.connect = oldTls; net.connect = oldNet;
  }
});
