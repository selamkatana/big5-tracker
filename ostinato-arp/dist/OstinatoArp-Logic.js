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

/*
 * OstinatoCore – gemeinsamer Kern für das Logic-Scripter-Plugin und den Browser-Editor.
 *
 * Enthält alles, was nicht vom Host abhängt:
 *  - Notennamen (Logic-Konvention: C3 = MIDI 60)
 *  - Akkord-Erkennung aus gehaltenen Noten
 *  - Skalen je Akkordtyp
 *  - Pattern-Text-Parser ("E3 F3 E3 F3", "1 3 5 3", Triolen-Gruppen …)
 *  - Referenz-Erkennung für eingespielte / importierte Noten
 *  - Quantisierung
 *  - Übersetzung Pattern-Note -> Tonhöhe für einen aktuellen Akkord
 *
 * Bewusst ES5-nah gehalten, damit es im JavaScriptCore von Logic und in jedem Browser läuft.
 */
var OstinatoCore = (function () {
  'use strict';

  var PC_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var PC_NAMES_DE = ['C', 'Cis', 'D', 'Es', 'E', 'F', 'Fis', 'G', 'Gis', 'A', 'B', 'H'];
  var LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11, H: 11 };

  function mod(n, m) { return ((n % m) + m) % m; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  /* ---------- Notennamen (Logic: C3 = 60, C-2 = 0) ---------- */

  function noteName(p) {
    return PC_NAMES[mod(p, 12)] + (Math.floor(p / 12) - 2);
  }

  /** "E3" -> {pc:4, pitch:64}; "F#" -> {pc:6, pitch:null}; Groß-Buchstabe Pflicht. */
  function parseNoteName(s) {
    var m = /^([A-GH])([#b]?)(-?\d+)?$/.exec(s);
    if (!m) return null;
    var pc = LETTER_PC[m[1]];
    if (m[2] === '#') pc += 1; else if (m[2] === 'b') pc -= 1;
    if (m[3] === undefined) return { pc: mod(pc, 12), pitch: null };
    var pitch = (parseInt(m[3], 10) + 2) * 12 + pc;
    if (pitch < 0 || pitch > 127) return null;
    return { pc: mod(pc, 12), pitch: pitch };
  }

  /* ---------- Akkorde & Skalen ---------- */

  var CHORDS = [
    { id: 'maj', label: '', iv: [0, 4, 7], w: 1.0, q: 'maj' },
    { id: 'min', label: 'm', iv: [0, 3, 7], w: 1.0, q: 'min' },
    { id: '5', label: '5', iv: [0, 7], w: 0.8, q: null },
    { id: 'dim', label: 'dim', iv: [0, 3, 6], w: 0.85, q: 'dim' },
    { id: 'aug', label: 'aug', iv: [0, 4, 8], w: 0.8, q: 'aug' },
    { id: 'sus4', label: 'sus4', iv: [0, 5, 7], w: 0.85, q: 'sus' },
    { id: 'sus2', label: 'sus2', iv: [0, 2, 7], w: 0.8, q: 'sus' },
    { id: '7', label: '7', iv: [0, 4, 7, 10], w: 0.95, q: 'dom' },
    { id: 'maj7', label: 'maj7', iv: [0, 4, 7, 11], w: 0.95, q: 'maj' },
    { id: 'm7', label: 'm7', iv: [0, 3, 7, 10], w: 0.95, q: 'min' },
    { id: 'm7b5', label: 'm7b5', iv: [0, 3, 6, 10], w: 0.9, q: 'dim' },
    { id: 'dim7', label: 'dim7', iv: [0, 3, 6, 9], w: 0.85, q: 'dim' },
    { id: '6', label: '6', iv: [0, 4, 7, 9], w: 0.8, q: 'maj' },
    { id: 'm6', label: 'm6', iv: [0, 3, 7, 9], w: 0.8, q: 'min' },
    { id: 'add9', label: 'add9', iv: [0, 2, 4, 7], w: 0.8, q: 'maj' },
    { id: 'madd9', label: 'm(add9)', iv: [0, 2, 3, 7], w: 0.8, q: 'min' }
  ];
  var TRIAD = { maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8], sus: [0, 5, 7], dom: [0, 4, 7] };

  var SCALES = {
    ionian: [0, 2, 4, 5, 7, 9, 11],
    lydian: [0, 2, 4, 6, 7, 9, 11],
    mixolydian: [0, 2, 4, 5, 7, 9, 10],
    aeolian: [0, 2, 3, 5, 7, 8, 10],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    harmonic: [0, 2, 3, 5, 7, 8, 11],
    phrygian: [0, 1, 3, 5, 7, 8, 10],
    locrian: [0, 1, 3, 5, 6, 8, 10],
    lydaug: [0, 2, 4, 6, 8, 9, 11]
  };

  /**
   * Erkennt einen Akkord aus MIDI-Tonhöhen.
   * opts.defaultQuality: 'min'|'maj' – für Einzeltöne und Quinten (Powerchords)
   * opts.bassRoot: true -> tiefste Note ist immer der Grundton
   */
  function detectChord(pitches, opts) {
    opts = opts || {};
    if (!pitches || !pitches.length) return null;
    var sorted = pitches.slice().sort(function (a, b) { return a - b; });
    var bass = sorted[0];
    var pcs = {}, pcList = [];
    for (var i = 0; i < sorted.length; i++) {
      var pc = mod(sorted[i], 12);
      if (!pcs[pc]) { pcs[pc] = true; pcList.push(pc); }
    }
    var dq = opts.defaultQuality === 'maj' ? 'maj' : 'min';
    var best = null;
    if (pcList.length === 1) {
      best = { root: pcList[0], chord: dq === 'maj' ? CHORDS[0] : CHORDS[1], single: true };
    } else {
      var roots = opts.bassRoot ? [mod(bass, 12)] : pcList;
      for (var r = 0; r < roots.length; r++) {
        var root = roots[r];
        var rel = {}, relCount = 0;
        for (var k = 0; k < pcList.length; k++) { rel[mod(pcList[k] - root, 12)] = true; relCount++; }
        for (var c = 0; c < CHORDS.length; c++) {
          var t = CHORDS[c], matched = 0;
          for (var j = 0; j < t.iv.length; j++) if (rel[t.iv[j]]) matched++;
          var missing = t.iv.length - matched, extra = relCount - matched;
          var score = matched * 2 - missing * 2.5 - extra * 1.5 + t.w + (root === mod(bass, 12) ? 1.2 : 0);
          if (!best || score > best.score) best = { root: root, chord: t, score: score };
        }
      }
    }
    var q = best.chord.q || dq;
    var iv = best.chord.q ? best.chord.iv : TRIAD[dq].slice();
    if (best.chord.id === '5') iv = [0, 7];
    return {
      root: best.root,
      id: best.chord.id,
      iv: best.single ? TRIAD[dq].slice() : iv,
      quality: q,
      bass: bass,
      held: sorted,
      name: PC_NAMES[best.root] + (best.single ? (dq === 'min' ? 'm' : '') : best.chord.label) +
        (mod(bass, 12) !== best.root ? '/' + PC_NAMES[mod(bass, 12)] : '')
    };
  }

  /** Skala (7 Töne) passend zum Akkordtyp. */
  function scaleFor(quality, opts) {
    opts = opts || {};
    switch (quality) {
      case 'maj': return SCALES[opts.majorScale || 'ionian'];
      case 'min': return SCALES[opts.minorScale || 'aeolian'];
      case 'dim': return SCALES.locrian;
      case 'aug': return SCALES.lydaug;
      case 'sus':
      case 'dom': return SCALES.mixolydian;
      default: return SCALES[opts.minorScale || 'aeolian'];
    }
  }

  /** i-ter Ton einer periodischen Tonleiter / Akkordtonliste (auch negativ, mit Oktav-Wrap). */
  function stepAt(tones, i) {
    var n = tones.length, q = Math.floor(i / n);
    return tones[i - q * n] + 12 * q;
  }

  /** Größter Index i mit stepAt(tones,i) <= o. */
  function indexBelow(tones, o) {
    var n = tones.length;
    var i = Math.floor(o / 12) * n - n;
    while (stepAt(tones, i + 1) <= o) i++;
    while (stepAt(tones, i) > o) i--;
    return i;
  }

  /* ---------- Raster ---------- */

  var GRIDS = {
    '1/1': 4, '1/2': 2, '1/2.': 3, '1/4': 1, '1/4.': 1.5, '1/4T': 2 / 3,
    '1/8': 0.5, '1/8.': 0.75, '1/8T': 1 / 3, '1/16': 0.25, '1/16.': 0.375, '1/16T': 1 / 6,
    '1/32': 0.125, '1/32T': 1 / 12
  };
  function gridToBeats(g) {
    if (typeof g === 'number') return g;
    var b = GRIDS[String(g).replace(/\s/g, '')];
    if (!b) throw new Error('Unbekanntes Raster "' + g + '" (z.B. 1/8, 1/16, 1/8T, 1/16T)');
    return b;
  }

  /* ---------- Referenz ---------- */

  /** ref: "E3" | "E" | {pc,pitch} -> {pc, pitch, hasOctave} */
  function parseRef(ref) {
    if (ref === undefined || ref === null || ref === '') return null;
    if (typeof ref === 'number') return { pc: mod(ref, 12), pitch: ref, hasOctave: true };
    var n = parseNoteName(String(ref).trim());
    if (!n) throw new Error('Ungültige Referenz "' + ref + '" (z.B. "E2" oder "E")');
    if (n.pitch === null) return { pc: n.pc, pitch: 60 + n.pc, hasOctave: false };
    return { pc: n.pc, pitch: n.pitch, hasOctave: true };
  }

  function normQuality(q) {
    if (!q) return null;
    q = String(q).toLowerCase();
    if (q === 'min' || q === 'moll' || q === 'm' || q === 'minor') return 'min';
    if (q === 'maj' || q === 'dur' || q === 'major') return 'maj';
    return null;
  }

  /**
   * Schätzt Grundton + Tongeschlecht einer Notenfolge.
   * notes: [{pos,len,pitch,vel}], opts.defaultQuality für Gleichstand Dur/Moll.
   */
  function detectReference(notes, opts) {
    opts = opts || {};
    if (!notes.length) return { pc: 0, pitch: 60, quality: opts.defaultQuality || 'min' };
    var lowest = 127, first = notes[0], total = 0, w = [];
    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      if (n.pitch < lowest) lowest = n.pitch;
      if (n.pos < first.pos) first = n;
      var beatW = Math.abs(n.pos - Math.round(n.pos)) < 0.02 ? 2 :
        Math.abs(n.pos * 2 - Math.round(n.pos * 2)) < 0.04 ? 1.4 : 1;
      var ww = Math.max(0.1, Math.min(n.len, 2)) * (0.5 + n.vel / 127) * beatW;
      w.push(ww); total += ww;
    }
    var dq = opts.defaultQuality === 'maj' ? 'maj' : 'min';
    var best = null;
    var qs = opts.quality ? [opts.quality] : (dq === 'min' ? ['min', 'maj'] : ['maj', 'min']);
    var roots = opts.rootPc !== undefined && opts.rootPc !== null ? [opts.rootPc] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    for (var r = 0; r < roots.length; r++) {
      var root = roots[r];
      for (var qi = 0; qi < qs.length; qi++) {
        var q = qs[qi], triad = TRIAD[q], scale = scaleFor(q, opts);
        var score = 0;
        for (var k = 0; k < notes.length; k++) {
          var rel = mod(notes[k].pitch - root, 12);
          var f = rel === 0 ? 1.6 : triad.indexOf(rel) >= 0 ? 1.0 : scale.indexOf(rel) >= 0 ? 0.15 : -0.6;
          score += w[k] * f;
        }
        if (mod(first.pitch, 12) === root) score += 0.15 * total;
        if (mod(lowest, 12) === root) score += 0.15 * total;
        if (!best || score > best.score + 1e-9) best = { pc: root, quality: q, score: score };
      }
    }
    // Referenz-Tonhöhe: höchste Instanz des Grundtons <= tiefster Note
    var pitch = lowest - mod(lowest - best.pc, 12);
    return { pc: best.pc, pitch: pitch, quality: best.quality };
  }

  /* ---------- Pattern-Text-Parser ---------- */

  var TOKEN_RE = /^([#b]?)(-?\d+|[A-GH][#b]?(?:-?\d+)?)([+\-]*)((?:[!?'~]|@\d+)*)$/;

  function tokenize(text) {
    return String(text).replace(/[()]/g, function (c) { return ' ' + c + ' '; })
      .split(/\s+/).filter(function (t) { return t && t !== '|'; });
  }

  /**
   * Parst ein Pattern-Textfeld zu Noten mit Offset relativ zum Referenz-Grundton.
   * mode: 'interval' (Zahlen = Halbtöne), 'scale' (Zahlen = Stufen, 1 = Grundton),
   *       'chord' (Zahlen = Akkordton, 1 = tiefster Ton). Notennamen gehen überall.
   */
  function parseSteps(text, opts) {
    var mode = opts.mode, step = gridToBeats(opts.grid || '1/16');
    var ref = opts.ref, refQuality = opts.quality || 'min';
    var triad = TRIAD[refQuality] || TRIAD.min, scale = scaleFor(refQuality, opts);
    var baseVel = opts.vel || 100;
    var toks = tokenize(text), notes = [], pos = 0, last = null, prevOff = 0;

    function pitchOf(tok) {
      var m = TOKEN_RE.exec(tok);
      if (!m) throw new Error('Unbekanntes Zeichen "' + tok + '"');
      var pre = m[1], body = m[2], oct = 0, mods = m[4], off;
      for (var i = 0; i < m[3].length; i++) oct += m[3].charAt(i) === '+' ? 12 : -12;
      var alt = pre === '#' ? 1 : pre === 'b' ? -1 : 0;
      if (/^[A-GH]/.test(body)) {
        var nn = parseNoteName(body);
        if (!nn) throw new Error('Ungültige Note "' + body + '"');
        if (nn.pitch !== null) off = nn.pitch - ref.pitch;
        else { off = mod(nn.pc - ref.pc, 12); off += 12 * Math.round((prevOff - off) / 12); }
        off += alt;
      } else {
        var num = parseInt(body, 10);
        if (mode === 'interval') off = num + alt;
        else {
          if (num < 1) throw new Error('"' + tok + '": Stufen/Akkordtöne beginnen bei 1');
          off = (mode === 'chord' ? stepAt(triad, num - 1) : stepAt(scale, num - 1)) + alt;
        }
      }
      off += oct;
      var vel = baseVel, acc = false, art = null, mm, modRe = /([!?'~])|@(\d+)/g;
      while ((mm = modRe.exec(mods))) {
        if (mm[1] === '!') acc = true;
        else if (mm[1] === '?') vel = Math.round(vel * 0.55);
        else if (mm[1] === "'") art = 'stac';
        else if (mm[1] === '~') art = 'leg';
        else vel = clamp(parseInt(mm[2], 10), 1, 127);
      }
      prevOff = off;
      return { off: off, vel: vel, acc: acc, art: art };
    }

    function place(tok, len) {
      if (tok === '.' || tok === 'r') { last = null; pos += len; return; }
      if (tok === '-') {
        if (last) { last.span += len; }
        pos += len; return;
      }
      var p = pitchOf(tok);
      last = { pos: pos, span: len, off: p.off, vel: p.vel, acc: p.acc, art: p.art };
      notes.push(last);
      pos += len;
    }

    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (t === '(') {
        var group = [];
        i++;
        while (i < toks.length && toks[i] !== ')') {
          if (toks[i] === '(') throw new Error('Verschachtelte Klammern werden nicht unterstützt');
          group.push(toks[i]); i++;
        }
        if (i >= toks.length) throw new Error('Fehlende ")"');
        if (!group.length) throw new Error('Leere Klammer "()"');
        var sub = step / group.length;
        for (var g = 0; g < group.length; g++) place(group[g], sub);
      } else if (t === ')') {
        throw new Error('")" ohne "("');
      } else place(t, step);
    }
    for (var n = 0; n < notes.length; n++) {
      var x = notes[n];
      x.len = x.art === 'leg' ? x.span : x.art === 'stac' ? x.span * 0.45 : x.span * 0.9;
      delete x.span;
    }
    return { notes: notes, length: pos };
  }

  /* ---------- Pattern-Definitionen kompilieren ---------- */

  /**
   * Macht aus einer Pattern-Definition (Code-Objekt, Editor-Export oder Aufnahme)
   * ein einheitliches Pattern:
   *  { name, mode, length, ref:{pc,pitch,quality}, abs, notes:[{pos,len,off,vel,acc,art}] }
   *
   * Definition:
   *  { name, mode:'interval'|'scale'|'chord', ref:'E2', quality:'min', grid:'1/16',
   *    steps:'E2 F2 E2 F2', vel:100, length:4 }
   *  oder { ..., notes:[[pos,len,pitch,vel], ...] }  (absolute MIDI-Tonhöhen)
   */
  function compileDef(def, opts) {
    opts = opts || {};
    var mode = def.mode || 'interval';
    if (mode !== 'interval' && mode !== 'scale' && mode !== 'chord') throw new Error('Unbekannter Modus "' + mode + '"');
    var ref = parseRef(def.ref), quality = normQuality(def.quality);
    var out = { name: def.name || 'Pattern', mode: mode, notes: [], abs: false };
    if (def.notes) {
      var abs = [];
      for (var i = 0; i < def.notes.length; i++) {
        var n = def.notes[i];
        var o = Array.isArray(n) ? { pos: n[0], len: n[1], pitch: n[2], vel: n[3] === undefined ? 100 : n[3] } :
          { pos: n.pos, len: n.len, pitch: n.pitch, vel: n.vel === undefined ? 100 : n.vel };
        abs.push(o);
      }
      abs.sort(function (a, b) { return a.pos - b.pos || a.pitch - b.pitch; });
      var det = detectReference(abs, {
        defaultQuality: opts.defaultQuality, rootPc: ref ? ref.pc : null, quality: quality,
        minorScale: opts.minorScale, majorScale: opts.majorScale
      });
      if (ref && ref.hasOctave) det.pitch = ref.pitch;   // sonst: Lage aus den Noten
      out.ref = { pc: det.pc, pitch: det.pitch, quality: quality || det.quality };
      for (var j = 0; j < abs.length; j++) {
        out.notes.push({ pos: abs[j].pos, len: abs[j].len, off: abs[j].pitch - out.ref.pitch, vel: abs[j].vel, acc: false, art: null });
      }
      out.abs = true;
      var maxEnd = 0;
      for (var k = 0; k < abs.length; k++) maxEnd = Math.max(maxEnd, abs[k].pos + abs[k].len);
      out.length = def.length || Math.max(1, Math.ceil(maxEnd));
    } else {
      if (!ref) ref = { pc: 0, pitch: 60, hasOctave: false };
      var q = quality || opts.defaultQuality || 'min';
      out.ref = { pc: ref.pc, pitch: ref.pitch, quality: q };
      var parsed = parseSteps(def.steps || '', {
        mode: mode, grid: def.grid || '1/16', ref: ref, quality: q, vel: def.vel,
        minorScale: opts.minorScale, majorScale: opts.majorScale
      });
      out.notes = parsed.notes;
      out.length = def.length || parsed.length;
      out.abs = ref.hasOctave || /[A-GH]/.test(def.steps || '');
    }
    if (!(out.length > 0)) out.length = 4;
    return out;
  }

  /* ---------- Quantisierung (für Aufnahme & Import) ---------- */

  var QUANT = { off: 0, '1/8': 0.5, '1/16': 0.25, '1/32': 0.125, '1/8T': 1 / 3, '1/16T': 1 / 6 };

  /** notes: [{pos,len,pitch,vel}] in Beats ab Pattern-Anfang. q: Schlüssel aus QUANT oder 'auto'. */
  function quantize(notes, q, lengthBeats) {
    var out = [];
    for (var i = 0; i < notes.length; i++) {
      var n = notes[i], pos = n.pos;
      if (q === 'auto') {
        var s = Math.round(pos / 0.25) * 0.25, t = Math.round(pos / (1 / 6)) / 6;
        pos = Math.abs(t - pos) < Math.abs(s - pos) * 0.6 ? t : s;
      } else if (QUANT[q]) {
        pos = Math.round(pos / QUANT[q]) * QUANT[q];
      }
      pos = Math.round(pos * 240) / 240;
      if (lengthBeats && pos >= lengthBeats - 1e-6) continue;
      var len = Math.max(1 / 48, n.len);
      if (lengthBeats) len = Math.min(len, lengthBeats - pos);
      out.push({ pos: pos, len: len, pitch: n.pitch, vel: n.vel });
    }
    out.sort(function (a, b) { return a.pos - b.pos || a.pitch - b.pitch; });
    // Duplikate (gleiche Zeit + Tonhöhe) zusammenfassen
    var res = [];
    for (var j = 0; j < out.length; j++) {
      var dup = null;
      for (var k = res.length - 1; k >= 0 && Math.abs(res[k].pos - out[j].pos) < 1e-6; k--) {
        if (res[k].pitch === out[j].pitch) { dup = res[k]; break; }
      }
      if (dup) { dup.vel = Math.max(dup.vel, out[j].vel); dup.len = Math.max(dup.len, out[j].len); }
      else res.push(out[j]);
    }
    return res;
  }

  /* ---------- Umsetzen auf den aktuellen Akkord ---------- */

  /**
   * Bereitet ein Pattern für einen Modus vor (Akkordton-Index bzw. Skalenstufe je Note).
   * direction: 'fwd'|'rev'|'mirror'
   */
  function prepare(pattern, mode, opts) {
    opts = opts || {};
    var q = pattern.ref.quality || 'min';
    var triad = TRIAD[q] || TRIAD.min, scale = scaleFor(q, opts);
    var notes = pattern.notes.map(function (n) {
      return { pos: n.pos, len: n.len, off: n.off, vel: n.vel, acc: n.acc, art: n.art };
    });
    if (opts.direction === 'rev') {
      var offs = notes.map(function (n) { return n.off; }).reverse();
      for (var r = 0; r < notes.length; r++) notes[r].off = offs[r];
    } else if (opts.direction === 'mirror') {
      for (var m = 0; m < notes.length; m++) notes[m].off = -notes[m].off;
    }
    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      if (mode === 'chord') { n.idx = indexBelow(triad, n.off); n.alt = n.off - stepAt(triad, n.idx); }
      else if (mode === 'scale') { n.idx = indexBelow(scale, n.off); n.alt = n.off - stepAt(scale, n.idx); }
    }
    return { mode: mode, length: pattern.length, notes: notes, ref: pattern.ref, abs: pattern.abs };
  }

  /** Wo liegt der Grundton des aktuellen Akkords? lage: 'pattern'|'played'|'range' */
  function placeRoot(chord, prepared, lage, ctx) {
    ctx = ctx || {};
    var refPitch = prepared.ref.pitch, rootPc = chord.root;
    var nearest = function (target) {
      var c = target - mod(target - rootPc, 12);
      return (target - c) > 6 ? c + 12 : c;
    };
    if (lage === 'played') {
      for (var i = 0; i < chord.held.length; i++) if (mod(chord.held[i], 12) === rootPc) return chord.held[i];
      return chord.bass - mod(chord.bass - rootPc, 12);
    }
    if (lage === 'range' && ctx.range) {
      var lo = ctx.range[0], hi = ctx.range[1], mid = lo + (hi - lo) * 0.4;   // eher untere Mitte: klingt natürlicher
      var minO = 999, maxO = -999;
      for (var k = 0; k < prepared.notes.length; k++) {
        minO = Math.min(minO, prepared.notes[k].off); maxO = Math.max(maxO, prepared.notes[k].off);
      }
      if (minO > maxO) { minO = 0; maxO = 0; }
      var best = null, bestCost = Infinity;
      for (var cand = rootPc; cand < 128; cand += 12) {
        var a = cand + minO, b = cand + maxO;
        var outside = Math.max(0, lo - a) + Math.max(0, b - hi);
        var cost = outside * 10 + Math.abs((a + b) / 2 - mid) * 0.15 +
          (ctx.prevRoot !== undefined && ctx.prevRoot !== null ? Math.abs(cand - ctx.prevRoot) * 0.5 : 0);
        if (cost < bestCost) { bestCost = cost; best = cand; }
      }
      return best;
    }
    return nearest(refPitch);
  }

  /** Tonhöhe einer vorbereiteten Note über dem aktuellen Akkord (ohne Oktave/Bereich). */
  function mapPitch(n, prepared, chord, root, opts) {
    opts = opts || {};
    if (prepared.mode === 'interval') return root + n.off;
    if (prepared.mode === 'scale') return root + stepAt(scaleFor(chord.quality, opts), n.idx) + n.alt;
    var tones;
    if (opts.chordSource === 'held') tones = chord.held;
    else tones = chord.iv.map(function (x) { return root + x; });
    return stepAt(tones, n.idx) + n.alt;
  }

  function foldToRange(p, range) {
    if (!range) return p;
    var lo = range[0], hi = range[1];
    if (hi - lo < 11) return clamp(p, lo, hi);
    while (p < lo) p += 12;
    while (p > hi) p -= 12;
    return p;
  }

  /* ---------- Code-Ausgabe ---------- */

  function r3(x) { return Math.round(x * 1000) / 1000; }

  /** Pattern mit absoluten Noten als einfügbaren Code-Text. */
  function toCode(name, mode, ref, quality, length, absNotes) {
    var lines = ['{ name: "' + String(name).replace(/"/g, "'") + '", mode: "' + mode + '", ref: "' + noteName(ref) +
      '", quality: "' + quality + '", length: ' + r3(length) + ', notes: ['];
    var chunk = [];
    for (var i = 0; i < absNotes.length; i++) {
      var n = absNotes[i];
      chunk.push('[' + r3(n.pos) + ',' + r3(n.len) + ',' + n.pitch + ',' + Math.round(n.vel) + ']');
      if (chunk.length === 8) { lines.push('  ' + chunk.join(', ') + ','); chunk = []; }
    }
    if (chunk.length) lines.push('  ' + chunk.join(', '));
    lines.push(']},');
    return lines;
  }

  return {
    PC_NAMES: PC_NAMES, PC_NAMES_DE: PC_NAMES_DE, CHORDS: CHORDS, TRIAD: TRIAD, SCALES: SCALES, GRIDS: GRIDS, QUANT: QUANT,
    mod: mod, clamp: clamp, noteName: noteName, parseNoteName: parseNoteName,
    detectChord: detectChord, scaleFor: scaleFor, stepAt: stepAt, indexBelow: indexBelow,
    gridToBeats: gridToBeats, parseRef: parseRef, normQuality: normQuality, detectReference: detectReference,
    tokenize: tokenize, parseSteps: parseSteps, compileDef: compileDef, quantize: quantize,
    prepare: prepare, placeRoot: placeRoot, mapPitch: mapPitch, foldToRange: foldToRange, toCode: toCode
  };
})();



/*
 * Mitgelieferte Patterns (Film-Ostinato-Idiome, keine Kopien bestimmter Werke).
 *
 * Schreibweise "steps" (ein Eintrag pro Rasterschritt):
 *   Intervall-Modus:  0 = Grundton, 1 = kleine Sekunde, 7 = Quinte, 12 = Oktave, -5 = Quarte tiefer
 *   Skala-Modus:      1 = Grundton, 2 = zweite Stufe, b2 = tiefe zweite Stufe, 8 = Oktave
 *   Akkordton-Modus:  1 = tiefster Akkordton, 2 = zweiter, 4 = (bei Dreiklang) Oktave
 *   Notennamen:       E2, F#3, Bb1 (Logic-Konvention: C3 = 60)
 *   .  Pause      -  Note verlängern      (a b c)  Gruppe teilt einen Schritt (Triole/Quintole)
 *   Anhängsel:  !  Akzent   ?  leise (Ghost)   '  staccato   ~  legato   @90  Velocity 90
 *   +  Oktave höher   -  (direkt am Ton) Oktave tiefer, z.B. 5- oder 1++
 */
var BUILTIN_PATTERNS = [
  { name: 'Pulse 8tel (Grundton)', mode: 'interval', grid: '1/8', steps: '0! 0 0 0 0! 0 0 0' },
  { name: 'Drive 16tel 3-3-2', mode: 'interval', grid: '1/16', steps: '0! 0 0 0! 0 0 0! 0 | 0! 0 0 0! 0 0 0! 0' },
  { name: 'Oktav-Drive 3-3-2', mode: 'interval', grid: '1/16', steps: '0! 0 12 0! 0 12 0! 12 | 0! 0 12 0! 0 12 0! 12' },
  { name: 'Halbton-Pendel 16tel', mode: 'interval', grid: '1/16', steps: '0! 1 0 1 0 1 0 1 | 0! 1 0 1 0 1 0 1' },
  { name: 'Halbton-Pendel Triolen', mode: 'interval', grid: '1/8T', steps: '0! 1 0 0! 1 0 0! 1 0 0! 1 0' },
  { name: 'Quint-Pendel 8tel', mode: 'interval', grid: '1/8', steps: '0! 7 0 7 0! 7 0 7' },
  { name: 'Bass-Ostinato 1-5-8', mode: 'interval', grid: '1/8', steps: '0! 7 12 7 0! 7 12 7' },
  { name: 'Galopp', mode: 'interval', grid: '1/16', steps: '0! - 0 0 0! - 0 0 0! - 0 0 0! - 0 0' },
  { name: 'Pulse 16tel mit Ghosts', mode: 'interval', grid: '1/16', steps: '0! 0? 0? 0 0! 0? 0? 0 | 0! 0? 0? 0 0! 0? 0 0?' },
  { name: 'Triolen-Oktave', mode: 'interval', grid: '1/8T', steps: '0! 12 0 0! 12 0 0! 12 0 0! 12 0' },
  { name: 'Brass-Stabs', mode: 'interval', grid: '1/16', steps: "0!' . . 0' . . 0!' . | . . 0' 0' 0!' . . ." },
  { name: 'Arpeggio 16tel aufwärts', mode: 'chord', grid: '1/16', steps: '1! 2 3 4 1 2 3 4 | 1! 2 3 4 1 2 3 4' },
  { name: 'Arpeggio 16tel auf/ab', mode: 'chord', grid: '1/16', steps: '1! 2 3 4 5 4 3 2 | 1! 2 3 4 5 4 3 2' },
  { name: 'Arpeggio gebrochen 1-3-2-3', mode: 'chord', grid: '1/16', steps: '1! 3 2 3 1 3 2 3 | 1! 3 2 3 1 3 2 3' },
  { name: 'Triolen-Arpeggio', mode: 'chord', grid: '1/8T', steps: '1! 2 3 4 3 2 1! 2 3 4 3 2' },
  { name: 'Akkord-Synkope 3-3-2', mode: 'chord', grid: '1/8', steps: '1!~ - - 2!~ - - 3!~ -' },
  { name: 'Moll-Figur 16tel (Skala)', mode: 'scale', grid: '1/16', steps: '1! 2 3 5 3 2 1 5- | 1! 2 3 5 6 5 3 2' },
  { name: 'Sus-Pendel 8tel (Skala)', mode: 'scale', grid: '1/8', steps: '1! 2 1 4 1! 2 1 5' },
  { name: 'Spiccato mit Triolen-Wirbel', mode: 'interval', grid: '1/8', steps: "0!' 0' (0 1 0) 0' 0!' 0' (0 1 0) 7'" }
];



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
