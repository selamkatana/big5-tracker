// Nachbildung der Logic-Scripter-Umgebung, um das Skript ohne Logic zu testen.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SCRIPT = readFileSync(new URL('../dist/OstinatoArp-Logic.js', import.meta.url), 'utf8');

export function createHost({ saved = null, script = SCRIPT } = {}) {
  const out = [];
  const traces = [];
  const st = { playing: false, a: 1, b: 1, tempo: 120, num: 4, den: 4, cycling: false, left: 1, right: 9, nowMs: 0 };

  const rec = (ev, beat, ms) => {
    const r = { type: ev.constructor.name, ch: ev.channel, beat, ms };
    if ('pitch' in ev) { r.pitch = ev.pitch; r.vel = ev.velocity; }
    if (ev instanceof ControlChange) { r.number = ev.number; r.value = ev.value; }
    if (ev instanceof ProgramChange) r.number = ev.number;
    out.push(r);
  };
  class Event {
    constructor() { this.channel = 1; this.beatPos = 0; }
    send() { const b = st.playing ? st.a : st.stopping ? st.b : null; rec(this, b, b === null ? st.nowMs : null); }
    sendAtBeat(b) { rec(this, b, null); }
    sendAfterMilliseconds(ms) { rec(this, null, st.nowMs + ms); }
    trace() {}
  }
  class NoteOn extends Event { constructor() { super(); this.pitch = 60; this.velocity = 100; } }
  class NoteOff extends Event { constructor() { super(); this.pitch = 60; this.velocity = 64; } }
  class ControlChange extends Event { constructor() { super(); this.number = 1; this.value = 0; } }
  class ProgramChange extends Event { constructor() { super(); this.number = 0; } }
  class PitchBend extends Event { constructor() { super(); this.value = 0; } }

  let values = [];
  const ctx = {
    Event, NoteOn, NoteOff, ControlChange, ProgramChange, PitchBend,
    Trace: (s) => traces.push(String(s)),
    UpdatePluginParameters: () => {},
    MIDI: { allNotesOff() {}, noteName: (p) => String(p) },
    Date: { now: () => st.nowMs },
    GetTimingInfo: () => ({
      playing: st.playing, blockStartBeat: st.a, blockEndBeat: st.b, tempo: st.tempo,
      meterNumerator: st.num, meterDenominator: st.den, cycling: st.cycling,
      leftCycleBeat: st.left, rightCycleBeat: st.right
    }),
    GetParameter: (k) => values[idx(k)],
    SetParameter: (k, v) => { const i = idx(k); values[i] = quant(i, v); ctx.ParameterChanged(i, values[i]); }
  };
  vm.createContext(ctx);
  vm.runInContext(script, ctx, { filename: 'OstinatoArp-Logic.js' });

  const params = ctx.PluginParameters;
  function idx(k) {
    if (typeof k === 'number') return k;
    const i = params.findIndex((p) => p.name === k);
    if (i < 0) throw new Error('Parameter nicht gefunden: ' + k);
    return i;
  }
  function quant(i, v) {
    const p = params[i];
    if (p.type === 'menu') return Math.max(0, Math.min(p.valueStrings.length - 1, Math.round(v)));
    if (p.type === 'checkbox' || p.type === 'momentary') return v ? 1 : 0;
    if (p.type === 'lin') {
      v = Math.max(p.minValue, Math.min(p.maxValue, v));
      // wie Logic: Wert als normierte float32 speichern -> testet die Kodierung
      const steps = p.numberOfSteps || 0;
      const norm = Math.fround((v - p.minValue) / (p.maxValue - p.minValue));
      let back = p.minValue + norm * (p.maxValue - p.minValue);
      if (steps) { const st2 = (p.maxValue - p.minValue) / steps; back = p.minValue + Math.round((back - p.minValue) / st2) * st2; }
      return back;
    }
    return v;
  }
  values = params.map((p, i) => (saved && saved[i] !== undefined ? saved[i] : (p.defaultValue || 0)));
  values.forEach((v, i) => ctx.ParameterChanged(i, v));

  const host = {
    ctx, out, traces, st, params,
    set(name, v) { ctx.SetParameter(name, v); },
    get(name) { return values[idx(name)]; },
    menuIndex(name, label) {
      const p = params[idx(name)];
      const i = p.valueStrings.findIndex((s) => s.includes(label));
      if (i < 0) throw new Error(`"${label}" nicht in Menü ${name}`);
      return i;
    },
    select(name, label) { host.set(name, host.menuIndex(name, label)); },
    saved() { return values.slice(); },
    idle() { for (let i = 0; i < 20; i++) ctx.Idle(); },
    midi(type, a, b, beat, ch = 1) {
      const e = type === 'on' ? new NoteOn() : type === 'off' ? new NoteOff() : new ControlChange();
      if (type === 'cc') { e.number = a; e.value = b; } else { e.pitch = a; e.velocity = type === 'on' ? b : 0; }
      e.channel = ch; e.beatPos = beat || 0;
      ctx.HandleMIDI(e);
    },
    /** Transport läuft von..bis (Beats), events: [{beat, type:'on'|'off'|'cc', a, b}] */
    play(from, to, events = [], block = 1 / 16) {
      st.playing = true;
      const evs = events.slice().sort((x, y) => x.beat - y.beat);
      let t = from;
      while (t < to - 1e-9) {
        const a = t, b = Math.min(to, t + block);
        st.a = a; st.b = b;
        while (evs.length && evs[0].beat < b - 1e-12) {
          const e = evs.shift();
          host.midi(e.type, e.a, e.b, Math.max(e.beat, a), e.ch);
        }
        ctx.ProcessMIDI();
        t = b;
        st.nowMs += (b - a) * 60000 / st.tempo;
      }
    },
    stop(afterMs = 1500) {
      st.playing = false; st.stopping = true; ctx.ProcessMIDI(); st.stopping = false;
      const end = st.nowMs + afterMs;
      while (st.nowMs < end) { st.nowMs += 3; ctx.ProcessMIDI(); }
    },
    /** Transport steht; Zeit in ms. events: [{ms, type, a, b}] */
    free(fromMs, toMs, events = [], blockMs = 3) {
      st.playing = false;
      const evs = events.slice().sort((x, y) => x.ms - y.ms);
      st.nowMs = fromMs;
      while (st.nowMs < toMs) {
        while (evs.length && evs[0].ms <= st.nowMs) { const e = evs.shift(); host.midi(e.type, e.a, e.b, 0, e.ch); }
        ctx.ProcessMIDI();
        st.nowMs += blockMs;
      }
    },
    notes(type = 'NoteOn') { return out.filter((e) => e.type === type); },
    clear() { out.length = 0; traces.length = 0; }
  };
  return host;
}

/** Prüft, dass jede gesendete Note wieder beendet wurde. Liefert hängende Tonhöhen. */
export function hanging(out) {
  const open = new Map();
  const evs = out.filter((e) => e.type === 'NoteOn' || e.type === 'NoteOff')
    .map((e, i) => ({ ...e, i }));   // Sende-Reihenfolge
  for (const e of evs) {
    const k = e.ch + ':' + e.pitch;
    if (e.type === 'NoteOn' && e.vel > 0) open.set(k, (open.get(k) || 0) + 1);
    else open.set(k, Math.max(0, (open.get(k) || 0) - 1));
  }
  return [...open.entries()].filter(([, n]) => n > 0).map(([k]) => k);
}
