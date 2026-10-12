import test from 'node:test';
import assert from 'node:assert/strict';
import { createHost, hanging } from './host.mjs';

const chord = (beat, pitches, vel = 100) => pitches.map((p) => ({ beat, type: 'on', a: p, b: vel }));
const release = (beat, pitches) => pitches.map((p) => ({ beat, type: 'off', a: p, b: 0 }));
const Em = [40, 43, 47], Am = [45, 48, 52], C3maj = [60, 64, 67];
const near = (x, y) => Math.abs(x - y) < 1e-6;

test('Skript lädt, Parameter sind vollständig und einzigartig', () => {
  const h = createHost();
  const names = h.params.map((p) => p.name);
  assert.equal(new Set(names).size, names.length);
  assert.ok(h.params.length > 200);
  h.idle();
  assert.ok(!h.traces.some((t) => t.includes('FEHLER')), h.traces.join('\n'));
});

test('Pulse 8tel folgt dem Akkordwechsel', () => {
  const h = createHost();
  h.select('Pattern', 'Pulse 8tel');
  h.play(1, 17, [...chord(1, Em), ...release(8.95, Em), ...chord(9, Am), ...release(16.9, Am)]);
  const on = h.notes();
  const first = on.filter((n) => n.beat < 9), second = on.filter((n) => n.beat >= 9 && n.beat < 17);
  assert.equal(first.length, 16);
  assert.ok(first.every((n) => n.pitch === 40));
  assert.ok(second.every((n) => n.pitch === 45), JSON.stringify(second.map((n) => n.pitch)));
  assert.ok(near(first[1].beat - first[0].beat, 0.5));
  assert.equal(first[0].vel, 120);    // Akzent
  assert.equal(first[1].vel, 100);
  h.stop();
  assert.deepEqual(hanging(h.out), []);
});

test('Halbton-Pendel: E F E F über E, A Bb über A', () => {
  const h = createHost();
  h.select('Pattern', 'Halbton-Pendel 16tel');
  h.play(1, 9, [...chord(1, Em), ...release(4.95, Em), ...chord(5, Am)]);
  const on = h.notes();
  assert.deepEqual(on.slice(0, 4).map((n) => n.pitch), [40, 41, 40, 41]);
  assert.deepEqual(on.filter((n) => n.beat >= 5).slice(0, 4).map((n) => n.pitch), [45, 46, 45, 46]);
});

test('Akkord-Haltezeit: kurze Lücke zwischen Akkorden unterbricht nicht', () => {
  const h = createHost();
  h.select('Pattern', 'Halbton-Pendel 16tel');
  h.play(1, 9, [...chord(1, Em), ...release(4.9, Em), ...chord(5.1, Am)]);
  const on = h.notes();
  assert.ok(on.some((n) => near(n.beat, 5)), 'Note auf Schlag 5 muss gespielt werden');
});

test('Arpeggio im Akkordton-Modus nutzt das gespielte Voicing', () => {
  const h = createHost();
  h.select('Pattern', 'Arpeggio 16tel aufwärts');
  h.play(1, 2, chord(1, C3maj));
  assert.deepEqual(h.notes().map((n) => n.pitch), [60, 64, 67, 72]);
  const h2 = createHost();
  h2.select('Pattern', 'Arpeggio 16tel aufwärts');
  h2.play(1, 2, chord(1, [57, 60, 64, 67]));          // Am7 -> 4 Töne
  assert.deepEqual(h2.notes().map((n) => n.pitch), [57, 60, 64, 67]);
});

test('Zu spät gespielter Akkord wird auf der Zählzeit nachgezogen (Spät-Toleranz)', () => {
  const h = createHost();
  h.select('Pattern', 'Pulse 8tel');
  // Am kommt 40 ms (= 0.08 Beat bei 120 BPM) nach Schlag 5
  h.play(1, 7, [...chord(1, Em), ...release(4.9, Em), ...chord(5.08, Am), ...release(6.5, Am)]);
  const at5 = h.out.filter((e) => e.beat >= 5 && e.beat < 5.2 && e.type === 'NoteOn');
  assert.ok(at5.some((n) => n.pitch === 45), JSON.stringify(at5));
  h.stop();
  assert.deepEqual(hanging(h.out), []);
});

test('Ohne Haltezeit-Akkord: Start aus der Stille wird auf das Raster gezogen', () => {
  const h = createHost();
  h.select('Pattern', 'Pulse 8tel');
  h.play(1, 4, chord(2.06, Em));
  const on = h.notes();
  assert.ok(near(on[0].beat, 2.06), 'erste Note sofort (leicht verspätet) statt verschluckt');
  assert.ok(near(on[1].beat, 2.5));
});

test('Latch hält den Akkord nach dem Loslassen', () => {
  const h = createHost();
  h.select('Pattern', 'Pulse 8tel');
  h.set('Latch (Akkord halten)', 1);
  h.play(1, 9, [...chord(1, Em), ...release(1.5, Em)]);
  assert.equal(h.notes().length, 16);
});

test('Ohne Latch endet das Pattern nach dem Loslassen', () => {
  const h = createHost();
  h.select('Pattern', 'Pulse 8tel');
  h.play(1, 9, [...chord(1, Em), ...release(3, Em)]);
  assert.ok(h.notes().length <= 5);
  h.stop();
  assert.deepEqual(hanging(h.out), []);
});

test('Learn: Einspielen, Speichern im Projekt, Wiederherstellen', () => {
  const h = createHost();
  h.select('Aufnahme', 'bereit');
  h.set('Aufnahme-Länge', 1);
  // Motiv E3 F3 E3 F3 ... in 16teln ab Takt 2 (Beat 5), etwas ungenau gespielt
  const evs = [];
  for (let i = 0; i < 16; i++) {
    const t = 5 + i * 0.25 + (i % 3 === 0 ? 0.02 : -0.015);
    const p = i % 2 ? 65 : 64;
    evs.push({ beat: t, type: 'on', a: p, b: i % 4 === 0 ? 115 : 80 }, { beat: t + 0.2, type: 'off', a: p, b: 0 });
  }
  h.play(1, 10, evs);
  h.idle();
  assert.equal(h.get('Aufnahme'), 0);
  assert.equal(h.get('Pattern'), 0);
  assert.ok(h.traces.some((t) => t.includes('Aufnahme gespeichert: 16 Noten')), h.traces.join('\n'));
  assert.ok(h.traces.some((t) => t.includes('E-Moll')), h.traces.join('\n'));

  // Projekt "neu laden"
  const h2 = createHost({ saved: h.saved() });
  h2.play(1, 5, chord(1, Am));
  const on = h2.notes();
  assert.equal(on.length, 16);
  assert.deepEqual(on.slice(0, 4).map((n) => n.pitch), [69, 70, 69, 70]); // Lage wie Pattern: nächstes A zu E3 = A3
  assert.equal(on[0].vel, 115);
  assert.equal(on[1].vel, 80);
  assert.ok(near(on[1].beat, 1.25));
});

test('Learn ohne laufenden Transport (startet mit erster Note)', () => {
  const h = createHost();
  h.select('Aufnahme', 'bereit');
  h.set('Aufnahme-Länge', 1);
  const evs = [];
  for (let i = 0; i < 4; i++) {
    evs.push({ ms: 1000 + i * 500, type: 'on', a: 60 + i * 4, b: 100 }, { ms: 1000 + i * 500 + 400, type: 'off', a: 60 + i * 4, b: 0 });
  }
  h.free(0, 3500, evs);
  h.idle();
  assert.ok(h.traces.some((t) => t.includes('Aufnahme gespeichert: 4 Noten')), h.traces.join('\n'));
});

test('Spielt auch bei gestopptem Transport (freilaufend)', () => {
  const h = createHost();
  h.select('Pattern', 'Pulse 8tel');
  h.free(0, 1100, [{ ms: 100, type: 'on', a: 52, b: 100 }, { ms: 100, type: 'on', a: 55, b: 100 }, { ms: 100, type: 'on', a: 59, b: 100 }]);
  const on = h.notes();
  assert.ok(on.length >= 3 && on.length <= 5, String(on.length));
  assert.ok(on.every((n) => n.pitch === 52));
  const gaps = on.slice(1).map((n, i) => n.ms - on[i].ms);
  assert.ok(gaps.every((g) => Math.abs(g - 250) < 8), JSON.stringify(gaps));
});

test('CC-Zuordnung: Modwheel (CC1) -> Expression (CC11), skaliert', () => {
  const h = createHost();
  h.set('CC A: Ziel', 12);          // "CC 11"
  h.set('CC A: Max', 100);
  h.play(1, 1.1, [{ beat: 1, type: 'cc', a: 1, b: 127 }, { beat: 1.01, type: 'cc', a: 7, b: 50 }]);
  const cc = h.out.filter((e) => e.type === 'ControlChange');
  assert.deepEqual(cc.map((c) => [c.number, c.value]), [[11, 100], [7, 50]]);
});

test('Crescendo-Kurve auf CC11 über 1 Takt', () => {
  const h = createHost();
  h.select('Pattern', 'Pulse 8tel');
  h.set('CC B: Ziel', 12);
  h.select('CC B: Quelle', 'Crescendo');
  h.set('CC B: Min', 0); h.set('CC B: Max', 127); h.set('CC B: Dauer', 1);
  h.play(1, 7, chord(1, Em));
  const cc = h.out.filter((e) => e.type === 'ControlChange' && e.number === 11);
  assert.equal(cc[0].value, 0);
  assert.equal(cc[cc.length - 1].value, 127);
  for (let i = 1; i < cc.length; i++) assert.ok(cc[i].value >= cc[i - 1].value);
  const at3 = cc.filter((c) => c.beat <= 3).pop();
  assert.ok(Math.abs(at3.value - 64) <= 2);
});

test('Artikulation nach Notenlänge sendet Keyswitches nur bei Wechsel', () => {
  const h = createHost();
  h.select('Pattern', 'Galopp');
  h.select('Artikulation', 'Nach Notenlänge');
  h.play(1, 5, chord(1, Em));
  const ks = h.notes().filter((n) => n.pitch === 24 || n.pitch === 25);
  assert.ok(ks.length >= 2);
  for (let i = 1; i < ks.length; i++) assert.notEqual(ks[i].pitch, ks[i - 1].pitch);
});

test('Instrumentbereich Violinen faltet tiefe Akkorde nach oben', () => {
  const h = createHost();
  h.select('Pattern', 'Bass-Ostinato');
  h.select('Instrumentbereich', 'Violinen');
  h.play(1, 5, chord(1, Em));
  assert.ok(h.notes().every((n) => n.pitch >= 55 && n.pitch <= 100));
  const h2 = createHost();
  h2.select('Pattern', 'Bass-Ostinato');
  h2.select('Instrumentbereich', 'Violinen');
  h2.select('Lage', 'Instrumentbereich');
  h2.play(1, 5, chord(1, Em));
  const ps = h2.notes().map((n) => n.pitch);
  assert.deepEqual([...new Set(ps)].sort((a, b) => a - b), [64, 71, 76]); // Form 1-5-8 bleibt erhalten
});

test('Velocity-Quelle "Gespielter Anschlag" + Velocity-Bereich', () => {
  const h = createHost();
  h.select('Pattern', 'Pulse 8tel');
  h.select('Velocity-Quelle', 'Gespielter Anschlag');
  h.set('Akzent-Stärke', 0);
  h.set('Velocity Min', 40); h.set('Velocity Max', 90);
  h.play(1, 3, chord(1, Em, 127));
  assert.ok(h.notes().every((n) => n.vel === 90));
});

test('Pattern-Wahl per Taste', () => {
  const h = createHost();
  h.select('Pattern-Wahl per Taste', 'C-1');
  h.play(1, 2, [{ beat: 1, type: 'on', a: 12 + 3, b: 100 }, { beat: 1.1, type: 'off', a: 15, b: 0 }]);
  assert.equal(h.get('Pattern'), 3);
  assert.equal(h.notes().length, 0);
});

test('Cycle-Sprung hinterlässt keine hängenden Noten', () => {
  const h = createHost();
  h.select('Pattern', 'Akkord-Synkope');
  h.st.cycling = true; h.st.left = 1; h.st.right = 5;
  h.set('Latch (Akkord halten)', 1);
  // Block, der über das Cycle-Ende reicht
  h.st.playing = true;
  h.midi('on', 40, 100, 1); h.midi('on', 43, 100, 1); h.midi('on', 47, 100, 1);
  let t = 1;
  for (let i = 0; i < 200; i++) {
    let a = t, b = t + 0.1;
    h.st.a = a; h.st.b = b;
    h.ctx.ProcessMIDI();
    t = b > 5 ? 1 + (b - 5) : b;
  }
  h.set('Latch (Akkord halten)', 0);
  h.midi('off', 40, 0, t); h.midi('off', 43, 0, t); h.midi('off', 47, 0, t);
  h.stop();
  assert.deepEqual(hanging(h.out), []);
  assert.ok(h.notes().length > 10);
});

test('Ping-Pong, Tempo-Faktor und Oktav-Dopplung', () => {
  const h = createHost();
  h.select('Pattern', 'Arpeggio 16tel aufwärts');
  h.select('Richtung', 'Ping-Pong');
  h.play(1, 9, chord(1, C3maj));
  const ps = h.notes().map((n) => n.pitch);
  assert.deepEqual(ps.slice(0, 4), [60, 64, 67, 72]);
  assert.deepEqual(ps.slice(16, 20), [72, 67, 64, 60]);

  const h2 = createHost();
  h2.select('Pattern', 'Pulse 8tel');
  h2.select('Tempo-Faktor', 'Half');
  h2.select('Oktav-Dopplung', '+1');
  h2.play(1, 5, chord(1, Em));
  const on = h2.notes();
  assert.equal(on.length, 8);           // 4 Noten (Viertel) + 4 Dopplungen
  assert.ok(on.some((n) => n.pitch === 52));
});

test('Pattern als Code ausgeben', () => {
  const h = createHost();
  h.select('Pattern', 'Halbton-Pendel 16tel');
  h.set('Pattern als Code in Konsole', 1);
  h.set('Pattern als Code in Konsole', 0);
  h.idle();
  assert.ok(h.traces.some((t) => t.startsWith('{ name: "Halbton-Pendel 16tel"')), h.traces.join('\n'));
});
