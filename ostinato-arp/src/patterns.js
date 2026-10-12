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

if (typeof module !== 'undefined' && module.exports) module.exports = BUILTIN_PATTERNS;
