// Tests for nextc-aso/scripts/state.mjs: real clock timestamps, failed steps stay visible, run-to-run diff.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { init, step, source, assume, load, show, snapshot, diff } from '../nextc-aso/scripts/state.mjs';

const clock = (start) => { let t = Date.parse(start); return () => (t += 1000); };

test('timestamps come from the clock and steps record start and end', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aso-state-'));
  const now = clock('2026-11-16T02:00:00.000Z');
  init(root, { mode: 'run', app: 'Nestly' }, now);
  step(root, 'observe-us', 'start', {}, now);
  step(root, 'observe-us', 'done', { note: '24 terms' }, now);
  const s = load(root);
  assert.equal(s.startedAt, '2026-11-16T02:00:01.000Z');
  assert.equal(s.steps[0].startedAt, '2026-11-16T02:00:02.000Z');
  assert.equal(s.steps[0].endedAt, '2026-11-16T02:00:03.000Z');
  assert.equal(s.steps[0].status, 'done');
  assert.equal(s.updatedAt, '2026-11-16T02:00:03.000Z');
});

test('a failed step stays failed and is listed as unfinished', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aso-state-'));
  const now = clock('2026-11-16T03:00:00.000Z');
  init(root, { mode: 'express', app: 'TrailBloom', auto: true }, now);
  step(root, 'reviews', 'start', {}, now);
  step(root, 'reviews', 'failed', { note: 'ASC 401' }, now);
  source(root, 'search-volume', 'unavailable', { note: 'no provider connected' }, now);
  assume(root, 'Countries: US only', now);
  const text = show(load(root));
  assert.match(text, /\| reviews \| failed \|/);
  assert.match(text, /Unfinished or failed: reviews \(failed\)/);
  assert.match(text, /search-volume: unavailable/);
  assert.match(text, /Countries: US only \(2026-11-16T03:00:/);
  assert.throws(() => step(root, 'x', 'finished', {}, now), /status must be/);
});

test('diff compares the current outputs with the previous run snapshot', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aso-state-'));
  const now = clock('2026-11-16T04:00:00.000Z');
  fs.mkdirSync(path.join(root, 'metadata'), { recursive: true });
  const write = (sub, ranks) => {
    fs.writeFileSync(path.join(root, 'metadata', 'en-US.json'), JSON.stringify({ locale: 'en-US', ios: { subtitle: { current: null, proposed: sub } } }));
    fs.writeFileSync(path.join(root, 'keywords.csv'), `platform,country,term,observed_competition,app_rank,retrieved_at\nios,us,habit quest,open,${ranks},2026-11-16T04:00:00.000Z\n`);
  };
  init(root, { mode: 'run', app: 'TrailBloom' }, now);
  assert.match(diff(root), /first recorded run/);
  write('Daily side quests', 'not in top 50');
  snapshot(root, now);
  init(root, { mode: 'run' }, now);
  write('Real-life side quests', '14');
  const text = diff(root);
  assert.match(text, /ios\.subtitle: proposed "Daily side quests" → "Real-life side quests"/);
  assert.match(text, /"habit quest": app rank not in top 50 → 14/);
  assert.equal(load(root).app, 'TrailBloom', 'app name carries over between runs');
});
