import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../src/core.js');
const BUILTIN = require('../src/patterns.js');

test('Notennamen nach Logic-Konvention (C3 = 60)', () => {
  assert.equal(C.noteName(60), 'C3');
  assert.equal(C.noteName(0), 'C-2');
  assert.equal(C.parseNoteName('E3').pitch, 64);
  assert.equal(C.parseNoteName('Bb1').pitch, 46);
  assert.equal(C.parseNoteName('F#').pitch, null);
  assert.equal(C.parseNoteName('C-2').pitch, 0);
});

test('Akkorderkennung', () => {
  const name = (ps, o) => C.detectChord(ps, o).name;
  assert.equal(name([52, 55, 59]), 'Em');
  assert.equal(name([57, 60, 64]), 'Am');
  assert.equal(name([60, 64, 67]), 'C');
  assert.equal(name([64, 67, 72]), 'C/E');            // Sextakkord
  assert.equal(name([57, 60, 64, 67]), 'Am7');
  assert.equal(name([60, 67]), 'C5');
  assert.equal(name([62, 67, 69]), 'Dsus4');
  assert.equal(name([55, 59, 62, 65]), 'G7');
  assert.equal(C.detectChord([64]).quality, 'min');
  assert.equal(C.detectChord([64], { defaultQuality: 'maj' }).quality, 'maj');
  assert.equal(C.detectChord([64, 67, 72], { bassRoot: true }).root, 4);
});

test('Text-Pattern: Notennamen, Pausen, Bindungen, Triolen-Gruppen', () => {
  const ref = C.parseRef('E2');
  const r = C.parseSteps('E2! F2 . - (E2 F2 E2) E2@90 F2?', { mode: 'interval', grid: '1/16', ref, quality: 'min' });
  assert.ok(Math.abs(r.length - 1.75) < 1e-9);
  assert.deepEqual(r.notes.map((n) => n.off), [0, 1, 0, 1, 0, 0, 1]);
  assert.equal(r.notes[0].acc, true);
  assert.ok(Math.abs(r.notes[2].pos - 1) < 1e-9);
  assert.ok(Math.abs(r.notes[3].pos - (1 + 0.25 / 3)) < 1e-9);
  assert.equal(r.notes[5].vel, 90);
  assert.ok(r.notes[6].vel < 60);
  // Bindung verlängert nicht, wenn vorher eine Pause stand
  assert.ok(Math.abs(r.notes[1].len - 0.225) < 1e-9);
});

test('Text-Pattern: Akkordton- und Skalen-Modus', () => {
  const ref = C.parseRef('C3');
  const ch = C.parseSteps('1 2 3 4 3+ 1-', { mode: 'chord', grid: '1/16', ref, quality: 'min' });
  assert.deepEqual(ch.notes.map((n) => n.off), [0, 3, 7, 12, 19, -12]);
  const sc = C.parseSteps('1 b2 3 #4 8', { mode: 'scale', grid: '1/8', ref, quality: 'min' });
  assert.deepEqual(sc.notes.map((n) => n.off), [0, 1, 3, 6, 12]);
  assert.throws(() => C.parseSteps('1 2 x', { mode: 'chord', grid: '1/16', ref, quality: 'min' }), /Unbekanntes Zeichen/);
});

test('Referenz-Erkennung: E F E F -> E-Moll, Referenz E', () => {
  const notes = [];
  for (let i = 0; i < 16; i++) notes.push({ pos: i * 0.25, len: 0.2, pitch: i % 2 ? 53 : 52, vel: 100 });
  const r = C.detectReference(notes, {});
  assert.equal(r.pc, 4);
  assert.equal(r.quality, 'min');
  assert.equal(r.pitch, 52);
});

test('Referenz-Erkennung: Dur-Arpeggio', () => {
  const ps = [55, 59, 62, 67, 62, 59, 55, 59];
  const r = C.detectReference(ps.map((p, i) => ({ pos: i * 0.5, len: 0.4, pitch: p, vel: 90 })), {});
  assert.equal(C.PC_NAMES[r.pc], 'G');
  assert.equal(r.quality, 'maj');
});

test('Quantisierung inkl. Auto-Triolen', () => {
  const q = C.quantize([
    { pos: 0.02, len: 0.2, pitch: 60, vel: 80 },
    { pos: 0.34, len: 0.2, pitch: 62, vel: 80 },   // Triole
    { pos: 0.51, len: 0.2, pitch: 64, vel: 80 },
    { pos: 3.99, len: 0.2, pitch: 64, vel: 80 }    // fällt auf Ende -> verworfen
  ], 'auto', 4);
  assert.deepEqual(q.map((n) => Math.round(n.pos * 1000) / 1000), [0, 0.333, 0.5]);
});

test('Umsetzen auf Akkorde in allen Modi', () => {
  const pat = C.compileDef({ name: 't', mode: 'interval', ref: 'E2', steps: 'E2 F2 G2 B2', grid: '1/16' });
  const am = C.detectChord([45, 48, 52]);
  const c = C.detectChord([48, 52, 55]);
  const inter = C.prepare(pat, 'interval');
  const rootA = C.placeRoot(am, inter, 'pattern');
  assert.equal(rootA, 57);           // nächstgelegenes A zur Referenz E2 (52)
  assert.deepEqual(inter.notes.map((n) => C.mapPitch(n, inter, am, rootA)), [57, 58, 60, 64]);
  const scale = C.prepare(pat, 'scale');
  const rootC = C.placeRoot(c, scale, 'pattern');
  assert.deepEqual(scale.notes.map((n) => C.mapPitch(n, scale, c, rootC)), [48, 49, 52, 55]);
  const chord = C.prepare(pat, 'chord');
  assert.deepEqual(chord.notes.map((n) => C.mapPitch(n, chord, c, rootC, { chordSource: 'held' })), [48, 49, 52, 55]);
});

test('Instrumentbereich: Lage "range" und Falten', () => {
  const pat = C.compileDef({ name: 't', mode: 'interval', steps: '0 7 12', grid: '1/8' });
  const prep = C.prepare(pat, 'interval');
  const root = C.placeRoot(C.detectChord([40, 43, 47]), prep, 'range', { range: [55, 100] });
  assert.ok(root >= 55 && root + 12 <= 100);
  assert.equal(C.foldToRange(40, [55, 100]), 64);
  assert.equal(C.foldToRange(110, [55, 100]), 98);
});

test('Alle mitgelieferten Patterns kompilieren', () => {
  for (const def of BUILTIN) {
    const p = C.compileDef(def);
    assert.ok(p.notes.length > 0, def.name);
    assert.ok(p.length > 0, def.name);
  }
});

test('Code-Ausgabe ist wieder einlesbar', () => {
  const lines = C.toCode('X', 'interval', 52, 'min', 4, [{ pos: 0, len: 0.25, pitch: 52, vel: 100 }, { pos: 0.25, len: 0.25, pitch: 53, vel: 80 }]);
  const def = eval('(' + lines.join('\n').replace(/,\s*$/, '') + ')');
  const p = C.compileDef(def);
  assert.equal(p.ref.pitch, 52);
  assert.deepEqual(p.notes.map((n) => n.off), [0, 1]);
});
