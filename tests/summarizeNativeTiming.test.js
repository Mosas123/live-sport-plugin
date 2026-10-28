'use strict';
const { Readable } = require('node:stream');
const { decodeLine, summarizeStream } = require('../scripts/summarize-native-timing');

test('reports loss snapshots without adding overlapping counters or claiming completeness', async () => {
  const id = 'a'.repeat(16);
  const sessionId = 'b'.repeat(32);
  const lines = [
    'ordinary server log with private data',
    JSON.stringify({ kind: 'native_timing', pid: 10, sessionId, type: 'http_start', id }),
    JSON.stringify({ kind: 'native_timing', pid: 10, sessionId, type: 'http_terminal', id, enqueued: true, admitted: false, outcome: 'timeout', queueMs: 100 }),
    `[NativeTimingSummary] ${JSON.stringify({ dropped: 2, pid: 10, sessionId, poolId: 'abcd1234' })}`,
    `[TimingOutputSummary] ${JSON.stringify({ rejected: 2, failed: 1, pid: 10, sessionId })}`,
    '[StreamTimingSummary] invalid json'
  ];
  const result = await summarizeStream(Readable.from([lines.join('\n')]));
  expect(result).toMatchObject({ timingRecords: 2, truncated: false, ignoredLines: 2,
    snapshots: { native: 1, stream: 0, output: 1 },
    losses: { nativeDropped: 2, streamDropped: 0, outputRejected: 2, outputFailed: 1 }, completeness: 'unknown' });
  expect(result.queue.groups[0]).toMatchObject({ total: 1, observed: 0, censored: 1, p95ObservedMs: null });
  expect(JSON.stringify(result)).not.toMatch(/private/);
});

test('repeated cumulative snapshots are counted once per process session and pool', async () => {
  const sessionId = 'b'.repeat(32);
  const summary = { dropped: 3, pid: 10, sessionId, poolId: 'abcd1234' };
  const lines = [`[NativeTimingSummary] ${JSON.stringify(summary)}`,
    `[NativeTimingSummary] ${JSON.stringify(summary)}`,
    `[NativeTimingSummary] ${JSON.stringify({ ...summary, dropped: 5 })}`,
    `[NativeTimingSummary] ${JSON.stringify({ ...summary, poolId: 'defa5678', dropped: 2 })}`];
  const report = await summarizeStream(Readable.from([lines.join('\n')]));
  expect(report.snapshots.native).toBe(2);
  expect(report.duplicateSnapshots).toBe(2);
  expect(report.losses.nativeDropped).toBe(7);
});

test('caps retained timing records and flags truncation', async () => {
  const lines = [1, 2].map(i => JSON.stringify({ kind: 'native_timing', pid: 1, sessionId: 'b'.repeat(32), type: 'http_start', id: String(i).padStart(16, '0') }));
  const result = await summarizeStream(Readable.from([lines.join('\n')]), 1);
  expect(result).toMatchObject({ timingRecords: 1, truncated: true });
  expect(result.queue.startsWithoutTerminalObserved).toBe(1);
});

test('ignores JSON outside the timing schema', () => {
  expect(decodeLine('{"url":"secret"}')).toBeNull();
  expect(decodeLine('[NativeTimingSummary] invalid')).toBeNull();
});

test('invalid snapshots are not silently counted as zero loss', async () => {
  const input = ['[NativeTimingSummary] {"dropped":"unknown"}', '[TimingOutputSummary] {"rejected":0}'];
  const result = await summarizeStream(Readable.from([input.join('\n')]));
  expect(result.invalidSnapshots).toBe(2);
  expect(result.snapshots).toEqual({ native: 0, stream: 0, output: 0 });
  expect(result.completeness).toBe('unknown');
});

test('extra event fields and oversized lines are not retained in the report', async () => {
  const event = { kind: 'native_timing', pid: 1, sessionId: 'b'.repeat(32), type: 'http_terminal',
    id: 'a'.repeat(16), enqueued: true, admitted: true, queueMs: 2, url: 'private-secret' };
  const input = [JSON.stringify(event), 'x'.repeat(9000)];
  const result = await summarizeStream(Readable.from([input.join('\n')]));
  expect(result.ignoredLines).toBe(1);
  expect(JSON.stringify(result)).not.toMatch(/private-secret/);
});

test('timing phases not included in the queue report are distinguished from ordinary log lines', async () => {
  const lines = ['ordinary log', JSON.stringify({ kind: 'native_timing', type: 'child_exit' })];
  const result = await summarizeStream(Readable.from([lines.join('\n')]));
  expect(result).toMatchObject({ ignoredLines: 1, otherTimingEvents: 1, timingRecords: 0 });
});
