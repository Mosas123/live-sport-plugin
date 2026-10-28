'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function loadChild(fetch) {
  let receive, disconnect;
  const send = jest.fn(), exit = jest.fn();
  const processStub = { once: (event, listener) => { if (event === 'message') receive = listener; if (event === 'disconnect') disconnect = listener; }, send, exit };
  const createNativeGuardedFetch = jest.fn(() => ({ fetch }));
  const source = fs.readFileSync(path.join(__dirname, '../src/services/isolated-native-child.cjs'), 'utf8');
  vm.runInNewContext(source, { process: processStub, Buffer, TypeError, RangeError,
    require: name => { if (name !== './NativeGuardedFetch') throw Error('unexpected import'); return { createNativeGuardedFetch }; } });
  return { receive, disconnect, exit, send, createNativeGuardedFetch };
}

test('child passes proxy settings to the guarded transport and returns a buffered result', async () => {
  const fetch = jest.fn(async () => ({ status: 200, url: 'https://damitv.st/', headers: new Headers({ 'content-type': 'text/plain' }),
    arrayBuffer: async () => Uint8Array.from(Buffer.from('fixture')).buffer, bodyTruncated: false }));
  const child = loadChild(fetch), options = { proxyUrl: 'socks5://127.0.0.1:40000', profile: 'vanilla' };
  await child.receive({ url: 'https://damitv.st/', options });
  expect(child.createNativeGuardedFetch).toHaveBeenCalledWith({ maxSlots: 1 });
  expect(fetch).toHaveBeenCalledWith('https://damitv.st/', options);
  expect(child.send.mock.calls[0][0]).toMatchObject({ type: 'result', status: 200, bytes: Buffer.from('fixture') });
});

test('child exits when its supervisor IPC disconnects', () => {
  const child = loadChild(jest.fn());
  child.disconnect();
  expect(child.exit).toHaveBeenCalledWith(1);
  expect(child.createNativeGuardedFetch).not.toHaveBeenCalled();
});

test('child serializes error policy without transmitting exception details', async () => {
  const failure = Object.assign(new TypeError('secret credential or URL'), { code: 'ERR_OUTBOUND_BLOCKED', isFatal: true });
  const child = loadChild(async () => { throw failure; });
  await child.receive({ url: 'https://cdn.example.org/', options: {} });
  const message = child.send.mock.calls[0][0];
  expect(message.error).toMatchObject({ code: 'ERR_OUTBOUND_BLOCKED', kind: 'TypeError', isFatal: true });
  expect(JSON.stringify(message)).not.toContain('secret');
});
