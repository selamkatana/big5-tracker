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

if (typeof module !== 'undefined' && module.exports) module.exports = OstinatoCore;
