/* ===========================================================================
 *  OSTINATO ARP – Pattern-Arpeggiator für Logic Pro (MIDI-FX "Scripter")
 *
 *  Eigene Noten-Patterns, die beim Akkordwechsel automatisch mitgehen.
 *  Einspielen (Learn), als Text eingeben oder aus dem Ostinato-Editor
 *  (Piano-Roll + MIDI-File-Import) einfügen.
 *
 *  Notennamen nach Logic-Konvention: C3 = MIDI 60.
 * ======================================================================== */

// >>> EIGENE PATTERNS – hier einfügen (aus dem Editor oder aus der Konsole) >>>
var USER_PATTERNS = [
  // Beispiel (Text-Schreibweise):
  // { name: "Mein Ostinato", mode: "interval", ref: "E2", grid: "1/16", steps: "E2! F2 E2 F2 E2 F2 E2 F2" },
];
// <<< EIGENE PATTERNS <<<

/*__CORE__*/

/*__PATTERNS__*/

var NeedsTimingInfo = true;
var ResetParameterDefaults = false;

var VERSION = '1.0';
var MAX_NOTES = 96;       // Speicherplätze für das eingespielte Pattern
var TPB = 240;            // Ticks pro Beat im Speicher
var ENC = 8192;           // Kodierungsbasis (13 Bit)
var C = OstinatoCore;

/* ------------------------------------------------------------------ */
/*  Patterns                                                           */
/* ------------------------------------------------------------------ */

var PATTERNS = [null];             // Index 0 = eingespieltes Pattern (Learn)
var PATTERN_NAMES = ['● Eigenes (Learn)'];
var LOAD_ERRORS = [];

(function loadPatterns() {
  var lists = [[USER_PATTERNS, '★ '], [BUILTIN_PATTERNS, '']];
  for (var l = 0; l < lists.length; l++) {
    var list = lists[l][0];
    for (var i = 0; i < list.length; i++) {
      var def = list[i];
      if (!def) continue;
      try {
        PATTERNS.push(C.compileDef(def));
        PATTERN_NAMES.push(lists[l][1] + (def.name || 'Pattern ' + (i + 1)));
      } catch (err) {
        LOAD_ERRORS.push('Pattern "' + (def.name || i + 1) + '": ' + err.message);
      }
    }
  }
})();

/* ------------------------------------------------------------------ */
/*  Tabellen                                                           */
/* ------------------------------------------------------------------ */

var CC_LABELS = { 0: 'Bank MSB', 1: 'Modulation', 2: 'Breath', 4: 'Foot', 5: 'Portamento', 7: 'Volume', 10: 'Pan',
  11: 'Expression', 21: 'CC21 (oft Vibrato)', 32: 'Bank LSB / UACC', 64: 'Sustain', 68: 'Legato' };
var CC_MENU = [], NOTE_MENU = [];
for (var _i = 0; _i < 128; _i++) {
  CC_MENU.push('CC ' + _i + (CC_LABELS[_i] ? ' – ' + CC_LABELS[_i] : ''));
  NOTE_MENU.push(C.noteName(_i) + ' (' + _i + ')');
}
var CC_TARGET_MENU = ['Aus'].concat(CC_MENU);

// Klingende Tonumfänge (MIDI). Logic-Namen: 55 = G2 usw.
var RANGES = [
  null,
  ['Violinen', 55, 100], ['Bratschen', 48, 88], ['Celli', 36, 79], ['Kontrabässe', 24, 60],
  ['Horn', 34, 77], ['Trompete', 54, 82], ['Posaune', 40, 72], ['Tuba / Bassposaune', 26, 58],
  ['Flöte', 60, 96], ['Piccolo', 74, 108], ['Oboe', 58, 91], ['Klarinette', 50, 91], ['Fagott', 34, 75],
  ['Harfe', 24, 103], ['Klavier', 21, 108], ['Eigener Bereich', 0, 0]
];
var RANGE_MENU = RANGES.map(function (r) { return r ? r[0] + (r[1] ? ' (' + C.noteName(r[1]) + '–' + C.noteName(r[2]) + ')' : '') : 'Aus'; });

var MINOR_SCALES = ['aeolian', 'dorian', 'harmonic', 'phrygian'];
var MAJOR_SCALES = ['ionian', 'lydian', 'mixolydian'];
var QUANT_KEYS = ['off', '1/8', '1/16', '1/32', '1/8T', '1/16T', 'auto'];
var ZONE_BASES = [null, 0, 12, 24, 96, 108];
var SHORT_THRESH = [0.125, 0.25, 0.5, 1];

/* ------------------------------------------------------------------ */
/*  Parameter                                                          */
/* ------------------------------------------------------------------ */

var DEFS = [], KEY = {};
function def(key, d) { KEY[key] = DEFS.length; d.key = key; DEFS.push(d); }
function hidden(key, name) {
  def(key, { name: name, type: 'lin', minValue: 0, maxValue: 1048575, numberOfSteps: 1048575, defaultValue: 0,
    hidden: true, disableAutomation: true });
}
function menu(key, name, items, dflt) { def(key, { name: name, type: 'menu', valueStrings: items, defaultValue: dflt || 0 }); }
function lin(key, name, min, max, dflt, unit, steps) {
  def(key, { name: name, type: 'lin', minValue: min, maxValue: max, defaultValue: dflt,
    numberOfSteps: steps || (max - min), unit: unit || '' });
}
function check(key, name, dflt) { def(key, { name: name, type: 'checkbox', defaultValue: dflt ? 1 : 0 }); }
function text(name) { def('t' + DEFS.length, { name: name, type: 'text' }); }

// Gespeichertes Learn-Pattern (unsichtbar, wird mit dem Projekt gesichert).
// Steht bewusst am Anfang, damit spätere Versionen neue Regler hinten anfügen können.
hidden('dCount', '_learn_n');
hidden('dLen', '_learn_len');
hidden('dSum', '_learn_sum');
for (var _n = 0; _n < MAX_NOTES; _n++) {
  hidden('dA' + _n, '_learn_a' + _n);
  hidden('dB' + _n, '_learn_b' + _n);
}

text('══════ OSTINATO ARP ' + VERSION + ' ══════');
menu('pattern', 'Pattern', PATTERN_NAMES, PATTERNS.length > 1 ? 1 : 0);
menu('mode', 'Modus', ['Wie Pattern', 'Intervall (transponieren)', 'Skala (diatonisch)', 'Akkordtöne (Arpeggio)']);
menu('chordSrc', 'Akkordtöne aus', ['Gehaltenen Noten (Voicing)', 'Erkanntem Akkord (Grundstellung)']);
menu('lage', 'Lage', ['Auto', 'Wie Pattern', 'Wie gespielt', 'Instrumentbereich']);
lin('octave', 'Oktave', -3, 3, 0);
lin('transpose', 'Transponieren', -12, 12, 0, 'HT');
menu('direction', 'Richtung', ['Vorwärts', 'Rückwärts', 'Ping-Pong', 'Gespiegelt']);
menu('doubling', 'Oktav-Dopplung', ['Aus', '+1 Oktave', '−1 Oktave', '±1 Oktave']);

text('────── RHYTHMUS ──────');
menu('tempoFactor', 'Tempo-Faktor', ['½ (Half-Time)', '1×', '2× (Double-Time)'], 1);
lin('swing', 'Swing', 0, 100, 0, '%');
menu('swingGrid', 'Swing-Raster', ['1/16', '1/8']);
lin('gate', 'Notenlänge', 10, 200, 100, '%', 190);
lin('overlap', 'Legato-Überlappung', 0, 100, 0, 'ms');
lin('prob', 'Wahrscheinlichkeit', 0, 100, 100, '%');
menu('startMode', 'Pattern-Start', ['Taktsynchron', 'Neustart bei Anschlag', 'Neustart bei jedem Akkord']);
menu('changeQ', 'Akkordwechsel', ['Sofort', 'Nächste 1/16', 'Nächster Schlag', 'Nächster Takt']);
lin('lateTol', 'Spät-Toleranz', 0, 200, 60, 'ms');
lin('grace', 'Akkord-Haltezeit', 0, 1000, 150, 'ms', 100);
check('latch', 'Latch (Akkord halten)', 0);

text('────── VELOCITY ──────');
menu('velSrc', 'Velocity-Quelle', ['Pattern', 'Gespielter Anschlag', 'Pattern × Anschlag', 'Fest']);
lin('velFix', 'Velocity fest', 1, 127, 100);
lin('velMin', 'Velocity Min', 1, 127, 1);
lin('velMax', 'Velocity Max', 1, 127, 127);
lin('accent', 'Akzent-Stärke', 0, 60, 20);
lin('humVel', 'Humanize Velocity', 0, 30, 0);
lin('humTime', 'Humanize Timing', 0, 40, 0, 'ms');

text('────── DYNAMIK / CC ──────');
var CC_SOURCES = ['Eingang durchreichen', 'Note-Velocity', 'Akkord-Anschlag', 'Fest (= Max)', 'Crescendo',
  'Decrescendo', 'Swell (auf/ab)', 'LFO (Welle)'];
menu('aTarget', 'CC A: Ziel', CC_TARGET_MENU, 2);   // CC 1
menu('aSrc', 'CC A: Quelle', CC_SOURCES, 0);
menu('aIn', 'CC A: Eingangs-CC', CC_MENU, 1);
lin('aMin', 'CC A: Min', 0, 127, 0);
lin('aMax', 'CC A: Max', 0, 127, 127);
lin('aDur', 'CC A: Dauer', 0.25, 16, 4, 'Takte', 63);
menu('bTarget', 'CC B: Ziel', CC_TARGET_MENU, 0);
menu('bSrc', 'CC B: Quelle', CC_SOURCES, 4);
menu('bIn', 'CC B: Eingangs-CC', CC_MENU, 11);
lin('bMin', 'CC B: Min', 0, 127, 40);
lin('bMax', 'CC B: Max', 0, 127, 127);
lin('bDur', 'CC B: Dauer', 0.25, 16, 4, 'Takte', 63);
menu('curveRestart', 'Kurven-Neustart', ['Bei neuem Anschlag', 'Bei jedem Akkord', 'Taktsynchron']);
check('otherCC', 'Andere CCs durchlassen', 1);

text('────── ARTIKULATION ──────');
menu('artMode', 'Artikulation', ['Aus', 'Immer "Lang"', 'Nach Notenlänge', 'Nach Akzent', 'Länge + Akzent']);
menu('artOut', 'Artikulation senden als', ['Keyswitch-Note', 'CC-Wert (z.B. UACC)', 'Programmwechsel']);
menu('artCC', 'Artikulations-CC', CC_MENU, 32);
menu('artLong', 'Lang (Wert/Taste)', NOTE_MENU, 24);
menu('artShort', 'Kurz (Wert/Taste)', NOTE_MENU, 25);
menu('artAcc', 'Akzent (Wert/Taste)', NOTE_MENU, 26);
menu('artThresh', 'Kurz bis Länge', ['1/32', '1/16', '1/8', '1/4'], 1);

text('────── INSTRUMENT / AUSGABE ──────');
menu('range', 'Instrumentbereich', RANGE_MENU, 0);
menu('rangeLo', 'Eigener Bereich tief', NOTE_MENU, 36);
menu('rangeHi', 'Eigener Bereich hoch', NOTE_MENU, 96);
menu('outCh', 'Ausgabe-Kanal', ['Wie Eingang', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16']);
check('thru', 'Gespielten Akkord mitspielen', 0);
menu('zone', 'Pattern-Wahl per Taste', ['Aus', 'C-2 bis B-2', 'C-1 bis B-1', 'C0 bis B0', 'C6 bis B6', 'C7 bis B7']);

text('────── HARMONIE ──────');
menu('rootDetect', 'Grundton', ['Automatisch erkennen', 'Tiefste Note = Grundton']);
menu('single', 'Einzelton / Quinte gilt als', ['Moll', 'Dur']);
menu('minorScale', 'Moll-Skala', ['Äolisch (natürlich)', 'Dorisch', 'Harmonisch Moll', 'Phrygisch']);
menu('majorScale', 'Dur-Skala', ['Ionisch', 'Lydisch', 'Mixolydisch']);
check('showChords', 'Konsole: Akkorde anzeigen', 0);

text('────── AUFNAHME (LEARN) ──────');
menu('learn', 'Aufnahme', ['Aus', '● Aufnahme bereit']);
menu('learnStart', 'Aufnahme-Start', ['Automatisch', 'Taktanfang', 'Erste Note']);
lin('learnBars', 'Aufnahme-Länge', 1, 8, 2, 'Takte');
menu('learnQ', 'Quantisierung', ['Aus', '1/8', '1/16', '1/32', '1/8 Triole', '1/16 Triole', 'Auto (gerade + Triole)'], 6);
menu('learnMode', 'Learn: Modus', ['Intervall (transponieren)', 'Skala (diatonisch)', 'Akkordtöne (Arpeggio)']);
menu('lrefRoot', 'Learn: Grundton', ['Auto'].concat(C.PC_NAMES));
menu('lrefQ', 'Learn: Tongeschlecht', ['Auto', 'Moll', 'Dur']);
def('printCode', { name: 'Pattern als Code in Konsole', type: 'momentary' });

var PluginParameters = DEFS.map(function (d) {
  var o = {};
  for (var k in d) if (k !== 'key') o[k] = d[k];
  return o;
});

var V = {};
for (var _d = 0; _d < DEFS.length; _d++) V[DEFS[_d].key] = DEFS[_d].defaultValue || 0;

/* ------------------------------------------------------------------ */
/*  Zustand                                                            */
/* ------------------------------------------------------------------ */

var S = {
  phys: {}, physCount: 0, set: {}, inCh: 1,
  tl: [],                 // Zeitleiste [{beat, chord, anchor, curveAnchor, fromSilence}]
  pendingRelease: null,
  sounding: {}, offs: [], recent: [],
  prevRoot: null, lastArt: null, ccLast: [null, null],
  host: false, hostCursor: null,
  freeNow: 0, freeCursor: 0, lastMs: null,
  tempo: 120, barBeats: 4,
  cfg: null, cfgDirty: true, cfgVersion: 0,
  learnData: null, learnDirty: true, writing: false,
  learn: null,
  traceQ: []
};

function log(s) { S.traceQ.push(String(s)); }
for (var _e = 0; _e < LOAD_ERRORS.length; _e++) log('FEHLER ' + LOAD_ERRORS[_e]);

/* ------------------------------------------------------------------ */
/*  Learn-Speicher                                                     */
/* ------------------------------------------------------------------ */

function checksum(vals) {
  var s = 7;
  for (var i = 0; i < vals.length; i++) s = (s * 31 + vals[i]) % 1048573;
  return s;
}

function readLearnData() {
  var count = Math.round(GetParameter(KEY.dCount));
  if (!(count > 0)) return null;
  count = Math.min(count, MAX_NOTES);
  var lenT = Math.round(GetParameter(KEY.dLen));
  var vals = [count, lenT], notes = [];
  for (var i = 0; i < count; i++) {
    var a = Math.round(GetParameter(KEY['dA' + i])), b = Math.round(GetParameter(KEY['dB' + i]));
    vals.push(a, b);
    notes.push({ pos: (a % ENC) / TPB, vel: Math.floor(a / ENC), len: (b % ENC) / TPB, pitch: Math.floor(b / ENC) });
  }
  if (checksum(vals) !== Math.round(GetParameter(KEY.dSum))) log('Warnung: gespeichertes Learn-Pattern ist evtl. beschädigt.');
  return { length: Math.max(0.25, lenT / TPB), notes: notes };
}

function writeLearnData(data) {
  S.writing = true;
  var n = Math.min(data.notes.length, MAX_NOTES);
  var lenT = Math.min(ENC - 1, Math.round(data.length * TPB));
  var vals = [n, lenT];
  for (var i = 0; i < MAX_NOTES; i++) {
    var a = 0, b = 0;
    if (i < n) {
      var x = data.notes[i];
      a = Math.min(ENC - 1, Math.round(x.pos * TPB)) + C.clamp(Math.round(x.vel), 1, 127) * ENC;
      b = C.clamp(Math.round(x.len * TPB), 1, ENC - 1) + C.clamp(x.pitch, 0, 127) * ENC;
      vals.push(a, b);
    }
    SetParameter(KEY['dA' + i], a);
    SetParameter(KEY['dB' + i], b);
  }
  SetParameter(KEY.dCount, n);
  SetParameter(KEY.dLen, lenT);
  SetParameter(KEY.dSum, checksum(vals));
  S.writing = false;
  S.learnData = { length: data.length, notes: data.notes.slice(0, n) };
  S.learnDirty = false;
}

function learnPattern() {
  if (S.learnDirty) { S.learnData = readLearnData(); S.learnDirty = false; }
  if (!S.learnData || !S.learnData.notes.length) return null;
  var modes = ['interval', 'scale', 'chord'];
  var q = V.lrefQ === 1 ? 'min' : V.lrefQ === 2 ? 'maj' : null;
  return C.compileDef({
    name: 'Eigenes (Learn)', mode: modes[V.learnMode] || 'interval',
    ref: V.lrefRoot > 0 ? C.PC_NAMES[V.lrefRoot - 1] : null, quality: q,
    length: S.learnData.length, notes: S.learnData.notes.map(function (n) { return [n.pos, n.len, n.pitch, n.vel]; })
  }, scaleOpts());
}

/* ------------------------------------------------------------------ */
/*  Konfiguration (wird bei Parameteränderung neu gebaut)              */
/* ------------------------------------------------------------------ */

function scaleOpts() {
  return { minorScale: MINOR_SCALES[V.minorScale] || 'aeolian', majorScale: MAJOR_SCALES[V.majorScale] || 'ionian',
    defaultQuality: V.single === 1 ? 'maj' : 'min' };
}

function currentRange() {
  var r = RANGES[V.range];
  if (!r) return null;
  if (r[0] === 'Eigener Bereich') return [Math.min(V.rangeLo, V.rangeHi), Math.max(V.rangeLo, V.rangeHi)];
  return [r[1], r[2]];
}

function buildConfig() {
  var pat = V.pattern === 0 ? learnPattern() : PATTERNS[V.pattern];
  var cfg = { pattern: pat, ok: !!(pat && pat.notes.length) };
  S.cfgVersion++;
  S.cfg = cfg;
  S.cfgDirty = false;
  if (!cfg.ok) return cfg;
  var modes = [pat.mode, 'interval', 'scale', 'chord'];
  var so = scaleOpts();
  cfg.mode = modes[V.mode] || pat.mode;
  cfg.so = so;
  var dir = ['fwd', 'rev', 'fwd', 'mirror'][V.direction];
  var tf = [2, 1, 0.5][V.tempoFactor];
  var unit = V.swingGrid === 1 ? 0.5 : 0.25;
  function timed(prep) {
    var evs = [];
    for (var i = 0; i < prep.notes.length; i++) {
      var n = prep.notes[i], pos = n.pos * tf;
      if (V.swing > 0) {
        var u = pos / unit;
        if (Math.abs(u - Math.round(u)) < 1e-4 && Math.round(u) % 2 === 1) pos += unit * V.swing / 200;
      }
      evs.push({ pos: pos, len: n.len * tf, n: n, acc: n.acc, art: n.art, vel: n.vel });
    }
    evs.sort(function (a, b) { return a.pos - b.pos; });
    return evs;
  }
  so.direction = dir;
  cfg.prep = C.prepare(pat, cfg.mode, so);
  cfg.fwd = timed(cfg.prep);
  if (V.direction === 2) {
    var soR = scaleOpts(); soR.direction = 'rev';
    cfg.prepRev = C.prepare(pat, cfg.mode, soR);
    cfg.rev = timed(cfg.prepRev);
  }
  cfg.L = pat.length * tf;
  var lage = ['auto', 'pattern', 'played', 'range'][V.lage];
  cfg.range = currentRange();
  if (lage === 'auto') lage = pat.abs ? 'pattern' : 'played';
  if (lage === 'range' && !cfg.range) lage = 'pattern';
  cfg.lage = lage;
  cfg.chordSource = V.chordSrc === 0 ? 'held' : 'detected';
  return cfg;
}

function cfg() {
  if (S.cfgDirty || !S.cfg) {
    try { buildConfig(); }
    catch (err) { log('FEHLER: ' + err.message); S.cfg = { ok: false }; S.cfgDirty = false; }
  }
  return S.cfg;
}

/* ------------------------------------------------------------------ */
/*  Hilfen Zeit & Senden                                               */
/* ------------------------------------------------------------------ */

function msToBeats(ms) { return ms * S.tempo / 60000; }

function sendAt(ev, t) {
  if (S.host) ev.sendAtBeat(t);
  else {
    var ms = (t - S.freeNow) * 60000 / S.tempo;
    if (ms <= 0.5) ev.send(); else ev.sendAfterMilliseconds(ms);
  }
}

function outCh() { return V.outCh > 0 ? V.outCh : S.inCh; }

function sendOff(p, ch, t) {
  var off = new NoteOff();
  off.pitch = p; off.velocity = 0; off.channel = ch;
  sendAt(off, t);
}

function removePendingOff(p) {
  for (var i = S.offs.length - 1; i >= 0; i--) if (S.offs[i].p === p) S.offs.splice(i, 1);
}

function noteOn(p, vel, t, len) {
  var ch = outCh();
  var s = S.sounding[p];
  if (s && s.end > t - 1e-9) {          // gleiche Taste klingt noch -> vorher sauber beenden
    sendOff(p, s.ch, t);
    removePendingOff(p);
  }
  var on = new NoteOn();
  on.pitch = p; on.velocity = vel; on.channel = ch;
  sendAt(on, t);
  S.sounding[p] = { end: t + len, ch: ch };
  S.offs.push({ p: p, t: t + len, ch: ch });
}

function emitOffs(b) {
  if (!S.offs.length) return;
  S.offs.sort(function (x, y) { return x.t - y.t; });
  var keep = [];
  for (var i = 0; i < S.offs.length; i++) {
    var o = S.offs[i];
    if (o.t < b) {
      sendOff(o.p, o.ch, o.t);
      if (S.sounding[o.p] && Math.abs(S.sounding[o.p].end - o.t) < 1e-9) delete S.sounding[o.p];
    } else keep.push(o);
  }
  S.offs = keep;
}

function flushAll() {
  for (var p in S.sounding) {
    var off = new NoteOff();
    off.pitch = +p; off.velocity = 0; off.channel = S.sounding[p].ch;
    off.send();
  }
  S.sounding = {}; S.offs = []; S.recent = [];
}

/* ------------------------------------------------------------------ */
/*  Akkord-Zeitleiste                                                  */
/* ------------------------------------------------------------------ */

function lastEntry() { return S.tl.length ? S.tl[S.tl.length - 1] : null; }

function quantizeChange(beat) {
  var q = [0, 0.25, 1, S.barBeats][V.changeQ];
  if (!q) return beat;
  var origin = S.host ? 1 : 0;
  var k = Math.ceil((beat - origin - msToBeats(V.lateTol)) / q - 1e-9);
  var t = origin + k * q;
  return t < beat ? beat : t;
}

function restartAnchor(beat) {
  // Bei "Sofort": knapp zu spät gespielte Akkorde auf das 1/16-Raster zurückziehen.
  var g = 0.25, origin = S.host ? 1 : 0;
  var below = origin + Math.floor((beat - origin) / g + 1e-9) * g;
  if (beat - below <= msToBeats(V.lateTol) + 1e-9) return below;
  return beat;
}

function sameChord(a, b) {
  if (!a || !b || a.held.length !== b.held.length) return false;
  for (var i = 0; i < a.held.length; i++) if (a.held[i] !== b.held[i]) return false;
  return true;
}

function chordFromSet() {
  var pitches = [], vsum = 0;
  for (var k in S.set) { pitches.push(+k); vsum += S.set[k]; }
  if (!pitches.length) return null;
  var so = scaleOpts();
  var ch = C.detectChord(pitches, { defaultQuality: so.defaultQuality, bassRoot: V.rootDetect === 1 });
  ch.vel = Math.round(vsum / pitches.length);
  return ch;
}

function changeChord(beat) {
  var chord = chordFromSet();
  if (!chord) return;
  var last = lastEntry();
  if (last && last.chord && sameChord(last.chord, chord)) return;
  var apply = quantizeChange(beat);
  // Einträge ab diesem Zeitpunkt ersetzen (z.B. wenn die Akkordtöne nacheinander eintreffen)
  while (S.tl.length && S.tl[S.tl.length - 1].beat >= apply - 1e-9) S.tl.pop();
  last = lastEntry();
  var fromSilence = !last || !last.chord;
  var newAnchor = V.changeQ === 0 ? restartAnchor(apply) : apply;
  var anchor;
  if (V.startMode === 0) anchor = S.host ? 1 : (fromSilence ? newAnchor : last.anchor);
  else if (V.startMode === 1) anchor = fromSilence ? newAnchor : last.anchor;
  else anchor = newAnchor;
  var curveAnchor;
  if (V.curveRestart === 2) curveAnchor = S.host ? 1 : (fromSilence ? apply : last.curveAnchor);
  else if (V.curveRestart === 1) curveAnchor = apply;
  else curveAnchor = fromSilence ? apply : last.curveAnchor;

  var entry = { beat: apply, chord: chord, anchor: anchor, curveAnchor: curveAnchor, fromSilence: fromSilence };
  S.tl.push(entry);
  if (V.showChords) log('Akkord: ' + chord.name);
  if (!fromSilence && apply <= beat + 1e-9) lateRetrigger(beat, entry);
  sendChordCCs(chord, apply, fromSilence);
}

function entryAt(t) {
  for (var i = S.tl.length - 1; i >= 0; i--) if (S.tl[i].beat <= t + 1e-9) return S.tl[i];
  return null;
}

function rootFor(E) {
  var c = cfg();
  if (E.rootV !== S.cfgVersion) {
    E.root = C.placeRoot(E.chord, c.prep, c.lage, { range: c.range, prevRoot: S.prevRoot });
    E.rootV = S.cfgVersion;
    S.prevRoot = E.root;
  }
  return E.root;
}

function pitchFor(ev, E, prep) {
  var c = cfg();
  var root = rootFor(E);
  var p = C.mapPitch(ev.n, prep || c.prep, E.chord, root, { chordSource: c.chordSource, minorScale: c.so.minorScale, majorScale: c.so.majorScale });
  p += V.octave * 12 + V.transpose;
  p = C.foldToRange(p, c.range);
  return C.clamp(p, 0, 127);
}

function lateRetrigger(beat, E) {
  var tol = msToBeats(V.lateTol);
  if (tol <= 0) return;
  for (var i = 0; i < S.recent.length; i++) {
    var r = S.recent[i];
    if (r.dbl || r.t > beat + 1e-9 || beat - r.t > tol || r.end <= beat) continue;
    var np = pitchFor(r.ev, E, r.prep);
    if (np === r.pitch) continue;
    var s = S.sounding[r.pitch];
    if (s && Math.abs(s.end - r.end) < 1e-9) {
      sendOff(r.pitch, s.ch, beat);
      removePendingOff(r.pitch);
      delete S.sounding[r.pitch];
    }
    noteOn(np, r.vel, beat, r.end - beat);
    r.pitch = np;
  }
}

/* ------------------------------------------------------------------ */
/*  Velocity, Artikulation, CC                                         */
/* ------------------------------------------------------------------ */

function velocityFor(ev, chord) {
  var v;
  switch (V.velSrc) {
    case 1: v = chord.vel; break;
    case 2: v = ev.vel * chord.vel / 100; break;
    case 3: v = V.velFix; break;
    default: v = ev.vel;
  }
  if (ev.acc) v += V.accent;
  if (V.humVel > 0) v += (Math.random() * 2 - 1) * V.humVel;
  v = C.clamp(v, 1, 127);
  var lo = Math.min(V.velMin, V.velMax), hi = Math.max(V.velMin, V.velMax);
  v = lo + (v - 1) / 126 * (hi - lo);
  return C.clamp(Math.round(v), 1, 127);
}

function articulationFor(ev, len) {
  if (V.artMode === 0) return null;
  if (ev.art === 'stac') return 'short';
  if (ev.art === 'leg') return 'long';
  var short = len <= SHORT_THRESH[V.artThresh] * 1.01;
  switch (V.artMode) {
    case 1: return 'long';
    case 2: return short ? 'short' : 'long';
    case 3: return ev.acc ? 'acc' : 'long';
    default: return ev.acc ? 'acc' : short ? 'short' : 'long';
  }
}

function sendArticulation(art, t) {
  if (!art || art === S.lastArt) return;
  S.lastArt = art;
  var val = art === 'short' ? V.artShort : art === 'acc' ? V.artAcc : V.artLong;
  var ch = outCh();
  if (V.artOut === 0) {
    var on = new NoteOn(); on.pitch = val; on.velocity = 100; on.channel = ch;
    sendAt(on, t);
    var off = new NoteOff(); off.pitch = val; off.velocity = 0; off.channel = ch;
    sendAt(off, t + 0.01);
  } else if (V.artOut === 1) {
    var cc = new ControlChange(); cc.number = V.artCC; cc.value = val; cc.channel = ch;
    sendAt(cc, t);
  } else {
    var pc = new ProgramChange(); pc.number = val; pc.channel = ch;
    sendAt(pc, t);
  }
}

var LANES = ['a', 'b'];
function lane(i) {
  var k = LANES[i];
  return { target: V[k + 'Target'] - 1, src: V[k + 'Src'], input: V[k + 'In'], min: V[k + 'Min'], max: V[k + 'Max'], dur: V[k + 'Dur'] };
}
function scaleCC(L, v01) { return C.clamp(Math.round(L.min + v01 * (L.max - L.min)), 0, 127); }

function sendCC(i, number, value, t, force) {
  if (!force && S.ccLast[i] === value) return;
  S.ccLast[i] = value;
  var cc = new ControlChange(); cc.number = number; cc.value = value; cc.channel = outCh();
  if (t === null) cc.send(); else sendAt(cc, t);
}

function sendChordCCs(chord, t, fromSilence) {
  for (var i = 0; i < 2; i++) {
    var L = lane(i);
    if (L.target < 0) continue;
    if (L.src === 2) sendCC(i, L.target, scaleCC(L, chord.vel / 127), t, true);
    else if (L.src === 3 && fromSilence) sendCC(i, L.target, L.max, t, false);
  }
}

function sendNoteCCs(vel, t) {
  for (var i = 0; i < 2; i++) {
    var L = lane(i);
    if (L.target >= 0 && L.src === 1) sendCC(i, L.target, scaleCC(L, vel / 127), t, false);
  }
}

function curveValue(src, ph) {
  switch (src) {
    case 4: return C.clamp(ph, 0, 1);
    case 5: return 1 - C.clamp(ph, 0, 1);
    case 6: return ph >= 1 ? 0 : 0.5 - 0.5 * Math.cos(2 * Math.PI * C.clamp(ph, 0, 1));
    case 7: return 0.5 - 0.5 * Math.cos(2 * Math.PI * (ph - Math.floor(ph)));
  }
  return 0;
}

function runCurves(a, b) {
  for (var i = 0; i < 2; i++) {
    var L = lane(i);
    if (L.target < 0 || L.src < 4) continue;
    var durB = Math.max(0.25, L.dur * S.barBeats), res = 1 / 32;
    for (var t = Math.ceil(a / res - 1e-9) * res; t < b; t += res) {
      var E = entryAt(t);
      if (!E || !E.chord) continue;
      sendCC(i, L.target, scaleCC(L, curveValue(L.src, (t - E.curveAnchor) / durB)), t, false);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Pattern abspielen                                                  */
/* ------------------------------------------------------------------ */

function playEvent(ev, t, E, prep) {
  if (V.prob < 100 && !ev.acc && Math.random() * 100 >= V.prob) return;
  var c = cfg();
  var pitch = pitchFor(ev, E, prep);
  var vel = velocityFor(ev, E.chord);
  var len = ev.len * V.gate / 100;
  if (ev.art === 'leg' || V.gate >= 100) len += msToBeats(V.overlap);
  len = Math.max(len, 1 / 64);
  var tOn = t + (V.humTime > 0 ? msToBeats(Math.random() * V.humTime) : 0);
  sendArticulation(articulationFor(ev, ev.len * V.gate / 100), tOn);
  sendNoteCCs(vel, tOn);
  noteOn(pitch, vel, tOn, len);
  S.recent.push({ t: tOn, end: tOn + len, ev: ev, pitch: pitch, vel: vel, prep: prep });
  if (V.doubling > 0) {
    var shifts = V.doubling === 1 ? [12] : V.doubling === 2 ? [-12] : [12, -12];
    for (var s = 0; s < shifts.length; s++) {
      var p2 = pitch + shifts[s];
      if (p2 < 0 || p2 > 127) continue;
      if (c.range && (p2 < c.range[0] || p2 > c.range[1])) continue;
      var v2 = Math.max(1, Math.round(vel * 0.85));
      noteOn(p2, v2, tOn, len);
      S.recent.push({ t: tOn, end: tOn + len, ev: ev, pitch: p2, vel: v2, dbl: true });
    }
  }
}

function playSegment(E, s, e, lateStart) {
  var c = cfg();
  if (!c.ok || !E.chord) return;
  var L = c.L, A = E.anchor;
  var lo = s;
  if (lateStart) lo = Math.max(A, s - msToBeats(V.lateTol));
  var k0 = Math.floor((lo - A) / L + 1e-9), k1 = Math.floor((e - A) / L - 1e-9);
  for (var k = k0; k <= k1; k++) {
    var base = A + k * L;
    var rev = c.rev && (k % 2 !== 0);
    var evs = rev ? c.rev : c.fwd, prep = rev ? c.prepRev : c.prep;
    for (var i = 0; i < evs.length; i++) {
      var t = base + evs[i].pos;
      if (t < lo - 1e-9 || t >= e - 1e-9 || t < A - 1e-9) continue;
      playEvent(evs[i], Math.max(t, s), E, prep);
    }
  }
}

function processWindow(a, b) {
  if (b <= a) return;
  emitOffs(a);
  if (S.pendingRelease !== null && S.pendingRelease < b) {
    var rb = Math.max(S.pendingRelease, a);
    S.pendingRelease = null;
    while (S.tl.length && S.tl[S.tl.length - 1].beat >= rb - 1e-9) S.tl.pop();
    S.tl.push({ beat: rb, chord: null });
    S.prevRoot = null;
  }
  if (!S.learn) {
    // Segmente der Zeitleiste in [a, b)
    var start = -1;
    for (var i = 0; i < S.tl.length; i++) if (S.tl[i].beat <= a + 1e-9) start = i;
    for (var j = Math.max(0, start); j < S.tl.length; j++) {
      var E = S.tl[j];
      if (j > start && E.beat >= b) break;
      var s = Math.max(a, E.beat);
      var e = j + 1 < S.tl.length ? Math.min(b, S.tl[j + 1].beat) : b;
      if (e <= s) continue;
      var lateStart = E.fromSilence && E.beat >= a - 1e-9;
      playSegment(E, s, e, lateStart);
    }
  }
  emitOffs(b);
  runCurves(a, b);
  // Aufräumen
  var tol = msToBeats(Math.max(V.lateTol, 10)) + 0.5;
  S.recent = S.recent.filter(function (r) { return r.end > a && b - r.t < tol + 4; });
  if (S.tl.length > 8) {
    var cur = -1;
    for (var x = 0; x < S.tl.length; x++) if (S.tl[x].beat <= a) cur = x;
    if (cur > 2) S.tl.splice(0, cur - 1);
  }
}

/* ------------------------------------------------------------------ */
/*  Aufnahme (Learn)                                                   */
/* ------------------------------------------------------------------ */

function learnBegin() {
  S.learn = { start: null, end: null, notes: [], open: {}, host: S.host };
  flushAll();
  log('● Aufnahme bereit – spiele dein Motiv ein (oder lass eine MIDI-Region durchlaufen).');
}

function learnNote(isOn, p, vel, beat) {
  var L = S.learn;
  if (isOn && L.start === null) {
    var bars = Math.round(V.learnBars);
    var useBar = V.learnStart === 1 || (V.learnStart === 0 && S.host);
    if (useBar && S.host) {
      L.start = 1 + Math.floor((beat - 1 + 0.125) / S.barBeats) * S.barBeats;
    } else L.start = beat;
    L.end = L.start + Math.min(32, bars * S.barBeats);
    L.host = S.host;
    log('Aufnahme läuft: ' + bars + ' Takt(e).');
  }
  if (L.start === null) return;
  if (isOn) {
    if (beat >= L.end) return;
    L.open[p] = { pos: Math.max(0, beat - L.start), vel: vel };
  } else if (L.open[p]) {
    var o = L.open[p];
    delete L.open[p];
    L.notes.push({ pos: o.pos, len: Math.max(1 / 64, beat - L.start - o.pos), pitch: p, vel: o.vel });
  }
}

function learnFinish(nowBeat) {
  var L = S.learn;
  S.learn = null;
  if (!L || L.start === null) { SetParameter(KEY.learn, 0); return; }
  var length = L.end - L.start;
  for (var p in L.open) {
    var o = L.open[p];
    L.notes.push({ pos: o.pos, len: Math.max(1 / 64, Math.min(nowBeat, L.end) - L.start - o.pos), pitch: +p, vel: o.vel });
  }
  var notes = C.quantize(L.notes, QUANT_KEYS[V.learnQ], length);
  if (!notes.length) {
    log('Aufnahme: keine Noten erkannt.');
    SetParameter(KEY.learn, 0);
    return;
  }
  if (notes.length > MAX_NOTES) {
    log('Hinweis: nur die ersten ' + MAX_NOTES + ' Noten werden gespeichert (längere Patterns als Code einfügen).');
    notes = notes.slice(0, MAX_NOTES);
  }
  writeLearnData({ length: length, notes: notes });
  SetParameter(KEY.learn, 0);
  SetParameter(KEY.pattern, 0);
  S.cfgDirty = true;
  var pat = learnPattern();
  log('✔ Aufnahme gespeichert: ' + notes.length + ' Noten, ' + length + ' Beats. Erkannt: ' +
    C.PC_NAMES[pat.ref.pc] + (pat.ref.quality === 'min' ? '-Moll' : '-Dur') + ', Referenz ' + C.noteName(pat.ref.pitch) + '.');
  log('  Falsch erkannt? -> "Learn: Grundton" / "Learn: Tongeschlecht" einstellen.');
}

/* ------------------------------------------------------------------ */
/*  Code-Ausgabe                                                       */
/* ------------------------------------------------------------------ */

function printCode() {
  var c = cfg();
  if (!c.ok) { log('Kein Pattern aktiv.'); return; }
  var pat = c.pattern, abs = [];
  for (var i = 0; i < pat.notes.length; i++) {
    var n = pat.notes[i];
    abs.push({ pos: n.pos, len: n.len, pitch: C.clamp(pat.ref.pitch + n.off, 0, 127), vel: n.vel + (n.acc ? V.accent : 0) });
  }
  var lines = C.toCode(PATTERN_NAMES[V.pattern].replace(/^[★●]\s*/, ''), c.mode, pat.ref.pitch, pat.ref.quality, pat.length, abs);
  log('---- In USER_PATTERNS (oben im Skript) einfügen: ----');
  for (var j = 0; j < lines.length; j++) log(lines[j]);
  log('-----------------------------------------------------');
}

/* ------------------------------------------------------------------ */
/*  Logic-Callbacks                                                    */
/* ------------------------------------------------------------------ */

function eventBeat(e) {
  if (S.host) {
    var b = (typeof e.beatPos === 'number' && e.beatPos > 0) ? e.beatPos : (S.hostCursor || 1);
    return S.hostCursor !== null && b < S.hostCursor ? S.hostCursor : b;
  }
  return Math.max(S.freeCursor, S.freeNow);
}

function releaseAll(beat) {
  if (V.latch) return;
  S.pendingRelease = beat + msToBeats(V.grace);
}

function HandleMIDI(e) {
  var isOn = e instanceof NoteOn && e.velocity > 0;
  var isOff = e instanceof NoteOff || (e instanceof NoteOn && e.velocity === 0);

  if (isOn || isOff) {
    var beat = eventBeat(e);
    if (S.learn) { learnNote(isOn, e.pitch, e.velocity, beat); e.send(); return; }

    var zb = ZONE_BASES[V.zone];
    if (zb !== null && zb !== undefined && e.pitch >= zb && e.pitch < zb + 12) {
      if (isOn && e.pitch - zb < PATTERNS.length) SetParameter(KEY.pattern, e.pitch - zb);
      return;
    }
    if (V.thru) e.send();

    if (isOn) {
      S.inCh = e.channel || 1;
      var wasEmpty = S.physCount === 0;
      if (!S.phys[e.pitch]) S.physCount++;
      S.phys[e.pitch] = e.velocity;
      if (V.latch) { if (wasEmpty) S.set = {}; S.set[e.pitch] = e.velocity; }
      else { S.set = {}; for (var k in S.phys) S.set[k] = S.phys[k]; }
      S.pendingRelease = null;
      changeChord(beat);
    } else {
      if (S.phys[e.pitch]) { delete S.phys[e.pitch]; S.physCount--; }
      if (S.physCount <= 0) { S.physCount = 0; releaseAll(beat); }
    }
    return;
  }

  if (e instanceof ControlChange) {
    if (S.learn) { e.send(); return; }
    var used = false;
    for (var i = 0; i < 2; i++) {
      var L = lane(i);
      if (L.target >= 0 && L.src === 0 && L.input === e.number) {
        sendCC(i, L.target, scaleCC(L, e.value / 127), null, true);
        used = true;
      }
    }
    if (!used && V.otherCC) e.send();
    return;
  }
  e.send();
}

function ProcessMIDI() {
  var info = GetTimingInfo();
  S.tempo = info.tempo > 0 ? info.tempo : 120;
  S.barBeats = (info.meterNumerator > 0 && info.meterDenominator > 0) ? info.meterNumerator * 4 / info.meterDenominator : 4;

  if (info.playing) {
    var a = info.blockStartBeat, b = info.blockEndBeat;
    if (!S.host) transportStart(a);
    else if (S.hostCursor !== null && a < S.hostCursor - 0.01) jumped(a);

    if (S.learn && S.learn.start !== null && (b >= S.learn.end || !S.learn.host)) learnFinish(b);

    if (info.cycling && info.rightCycleBeat > info.leftCycleBeat && b > info.rightCycleBeat && a < info.rightCycleBeat) {
      processWindow(a, info.rightCycleBeat);
      jumped(info.leftCycleBeat);
      processWindow(info.leftCycleBeat, info.leftCycleBeat + (b - info.rightCycleBeat));
      S.hostCursor = info.leftCycleBeat + (b - info.rightCycleBeat);
    } else {
      processWindow(a, b);
      S.hostCursor = b;
    }
  } else {
    if (S.host) transportStop();
    var now = Date.now();
    if (S.lastMs === null) S.lastMs = now;
    var dt = Math.min(250, Math.max(0, now - S.lastMs));
    S.lastMs = now;
    S.freeNow += msToBeats(dt);
    if (S.learn && S.learn.start !== null && (S.freeNow >= S.learn.end || S.learn.host)) learnFinish(S.freeNow);
    var end = S.freeNow + msToBeats(25);
    if (end > S.freeCursor) {
      processWindow(Math.max(S.freeCursor, S.freeNow - 0.5), end);
      S.freeCursor = end;
    }
  }
}

function rebaseTimeline(at) {
  var cur = lastEntry();
  S.tl = [];
  S.prevRoot = null;
  if (cur && cur.chord) {
    var anchor = V.startMode === 0 && S.host ? 1 : at;
    var ca = V.curveRestart === 2 && S.host ? 1 : at;
    S.tl.push({ beat: at, chord: cur.chord, anchor: anchor, curveAnchor: ca, fromSilence: true });
  }
  if (S.pendingRelease !== null) S.pendingRelease = at + msToBeats(V.grace);
  S.lastArt = null; S.ccLast = [null, null];
}

function transportStart(a) {
  flushAll();
  S.host = true;
  S.hostCursor = a;
  if (S.learn && S.learn.start !== null) learnFinish(S.freeNow);
  rebaseTimeline(a);
}

function transportStop() {
  flushAll();
  if (S.learn && S.learn.start !== null) learnFinish(S.hostCursor || 0);
  S.host = false;
  S.hostCursor = null;
  S.lastMs = null;
  S.freeNow = 0; S.freeCursor = 0;
  rebaseTimeline(0);
}

function jumped(a) {
  flushAll();
  if (S.learn && S.learn.start !== null) learnFinish(S.learn.end);
  rebaseTimeline(a);
  S.hostCursor = a;
}

function ParameterChanged(index, value) {
  var d = DEFS[index];
  if (!d) return;
  var old = V[d.key];
  V[d.key] = value;
  if (d.hidden) { if (!S.writing) { S.learnDirty = true; S.cfgDirty = true; } return; }
  switch (d.key) {
    case 'learn':
      if (value === 1 && !S.learn) learnBegin();
      else if (value === 0 && S.learn) { S.learn = null; log('Aufnahme abgebrochen.'); }
      return;
    case 'printCode':
      if (value === 1) printCode();
      return;
    case 'latch':
      if (old === 1 && value === 0 && S.physCount === 0) releaseAll(S.host ? (S.hostCursor || 1) : S.freeCursor);
      break;
    case 'artMode': case 'artOut': case 'artLong': case 'artShort': case 'artAcc': case 'artCC':
      S.lastArt = null; break;
  }
  S.cfgDirty = true;
  S.ccLast = [null, null];
}

function Reset() {
  flushAll();
  S.lastArt = null;
  S.ccLast = [null, null];
}

function Idle() {
  var n = 0;
  while (S.traceQ.length && n++ < 40) Trace(S.traceQ.shift());
}
