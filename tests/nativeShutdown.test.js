'use strict';
const { closeNativePool } = require('../src/services/NativeShutdown');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('waits for native close confirmation', async () => {
  let finish, done = false;
  const result = closeNativePool(() => new Promise(resolve => { finish = resolve; }), 500).then(value => { done = true; return value; });
  await Promise.resolve(); expect(done).toBe(false);
  finish(); expect(await result).toBe(true);
});

test('bounds shutdown if native close never completes', async () => {
  expect(await closeNativePool(() => new Promise(() => {}), 20)).toBe(false);
});

test('reports a failed close', async () => {
  expect(await closeNativePool(() => { throw new Error('fixture'); }, 50)).toBe(false);
});

test('signal handler waits for the shared pool before exiting', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/resolverManager.js'), 'utf8');
  const section = source.slice(source.indexOf('let terminating = false;'), source.indexOf('\nmodule.exports'));
  let finish, handler;
  const close = jest.fn(() => new Promise(resolve => { finish = resolve; }));
  const processStub = { on: (event, fn) => { if (event === 'SIGTERM') handler = fn; }, exit: jest.fn() };
  const shutdownResolver = jest.fn();
  vm.runInNewContext(section, { process: processStub, console, shutdownResolver,
    require: name => name === './services/NativeShutdown' ? { closeNativePool } : { closeSharedOutbound: close } });
  const pending = handler();
  await Promise.resolve();
  expect(shutdownResolver).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(1);
  expect(processStub.exit).not.toHaveBeenCalled();
  finish(); await pending;
  expect(processStub.exit).toHaveBeenCalledWith(0);
});
