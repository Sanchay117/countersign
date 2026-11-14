// Turns the narration timings and the footage offsets into a shot list: when each scene starts,
// which stretch of footage it shows and where the camera looks.

import { staticFile } from "remotion";
import { SCRIPT } from "./script.ts";

export const FPS = 30;

export interface Word {
  text: string;
  start: number;
  end: number;
}
export interface Take {
  file: string;
  seconds: number;
  words: Word[];
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Capture {
  fps: number;
  width: number;
  height: number;
  seconds: number;
  origin: string;
  marks: Record<string, number>;
  rects: Record<string, Rect | null>;
}
/** A stretch of footage: `frames` of it starting `src` seconds in, shown from scene frame `at`. */
export interface Cut {
  at: number;
  frames: number;
  src: number;
}
/** Where the camera is centred (as fractions of the footage) and how far it is zoomed, at a frame. */
export interface Focus {
  at: number;
  cx: number;
  cy: number;
  z: number;
}
export interface Shot {
  id: string;
  from: number;
  frames: number;
  /** Frame, relative to the scene, where the narrator starts. */
  voiceAt: number;
  take: Take;
  text: string;
  cuts: Cut[];
  focus: Focus[];
  /** Scene frames at which things happen in the footage (a click, a stamp, a signature). */
  events: Record<string, number>;
}
export interface Sfx {
  file: string;
  at: number;
  volume: number;
}
export interface Plan {
  shots: Shot[];
  sfx: Sfx[];
  capture: Capture;
  total: number;
}

async function load<T>(path: string): Promise<T> {
  const res = await fetch(staticFile(path));
  if (!res.ok) throw new Error(`${path} is missing. Run npm run voice and npm run capture first.`);
  return (await res.json()) as T;
}

const bare = (text: string) => text.toLowerCase().replace(/[^a-z0-9$]/g, "");

/** Frame, relative to the scene, at which the narrator starts the `nth` word beginning with `word`. */
export function cue(shot: Shot, word: string, nth = 0): number {
  const hits = shot.take.words.filter((w) => bare(w.text).startsWith(word));
  const hit = hits[nth];
  if (!hit) throw new Error(`"${word}" is not in the ${shot.id} narration`);
  return shot.voiceAt + Math.round(hit.start * FPS);
}

// How long after a stamp lands the capture script noticed it and wrote its mark.
const STAMP_LAG = 0.15;
// Marks taken after a scroll and a pause: the stamp itself landed this much earlier.
const STOP2_LAG = 1.25;

/** Footage and camera for the two filmed scenes. */
function film(shot: Shot, c: Capture) {
  const m = c.marks;
  const laneA = 0.3;
  const laneB = 0.7;

  if (shot.id === "run") {
    // The form and the click, then agent A all the way to the money leaving.
    const a = cue(shot, "first") - 8;
    const src1 = m.sent - 2.6;
    const rest = (shot.frames - a) / FPS;
    const src2 = Math.max(m.lanes, m.lost + 3.3 - rest);
    shot.cuts = [
      { at: 0, frames: a, src: src1 },
      { at: a, frames: shot.frames - a, src: src2 },
    ];
    shot.events = { click: Math.round((m.sent - src1) * FPS), lost: a + Math.round((m.lost - src2) * FPS) };
    shot.focus = [
      { at: 0, cx: 0.5, cy: 0.3, z: 1.3 },
      { at: a - 1, cx: 0.5, cy: 0.3, z: 1.3 },
      { at: a, cx: laneA, cy: 0.4, z: 2 },
      { at: Math.max(a + 2, shot.events.lost - 30), cx: laneA, cy: 0.4, z: 2 },
      { at: shot.events.lost + 14, cx: laneA, cy: 0.61, z: 2 },
    ];
  }

  if (shot.id === "guard") {
    // Three payments by agent B: stopped in code, stopped by SERV, signed.
    const b = cue(shot, "look") - 8;
    const d = cue(shot, "real") - 8;
    const src1 = m.lanes + 0.1;
    const src2 = m.check2 + 0.1;
    const src3 = m.signed - 1.5;
    shot.cuts = [
      { at: 0, frames: b, src: src1 },
      { at: b, frames: d - b, src: src2 },
      { at: d, frames: shot.frames - d, src: src3 },
    ];
    shot.events = {
      stamp1: Math.round((m.stop1 - STAMP_LAG - src1) * FPS),
      stamp2: b + Math.round((m.stop2 - STOP2_LAG - src2) * FPS),
      sign: d + Math.round((m.signed - STAMP_LAG - src3) * FPS),
    };
    shot.focus = [
      { at: 0, cx: laneB, cy: 0.42, z: 2 },
      { at: cue(shot, "exact") - 20, cx: laneB, cy: 0.42, z: 2 },
      { at: cue(shot, "exact") + 14, cx: laneB, cy: 0.63, z: 2 },
      { at: b - 1, cx: laneB, cy: 0.63, z: 2 },
      { at: b, cx: laneB, cy: 0.5, z: 2 },
      { at: shot.events.stamp2 + 22, cx: laneB, cy: 0.5, z: 2 },
      { at: shot.events.stamp2 + 52, cx: laneB, cy: 0.73, z: 2 },
      { at: d - 1, cx: laneB, cy: 0.73, z: 2 },
      { at: d, cx: laneB, cy: 0.63, z: 1.7 },
    ];
  }

  // Keyframes must strictly increase for interpolation.
  shot.focus.forEach((k, i) => {
    k.at = Math.max(k.at, i ? shot.focus[i - 1].at + 1 : 0);
  });
}

export async function makePlan(): Promise<Plan> {
  const manifest = await load<{ lines: Record<string, Take> }>("vo/manifest.json");
  const capture = await load<Capture>("capture/site.json");

  const shots: Shot[] = [];
  let at = 0;
  for (const line of SCRIPT) {
    const take = manifest.lines[line.id];
    const lead = line.lead ?? 0.5;
    const frames = Math.round((lead + take.seconds + (line.tail ?? 0.8)) * FPS);
    const shot: Shot = { id: line.id, from: at, frames, voiceAt: Math.round(lead * FPS), take, text: line.text, cuts: [], focus: [], events: {} };
    film(shot, capture);
    shots.push(shot);
    at += frames;
  }

  const by = (id: string) => shots.find((s) => s.id === id)!;
  const sfx: Sfx[] = [];
  const add = (shot: Shot, frame: number, file: string, volume: number) => sfx.push({ file: `audio/${file}.wav`, at: shot.from + frame, volume });

  const name = by("name");
  add(name, cue(name, "signature"), "pen", 0.8);
  const run = by("run");
  add(run, run.events.click, "tick", 0.6);
  add(run, run.events.lost, "coin", 0.5);
  const guard = by("guard");
  add(guard, guard.events.stamp1, "stamp", 0.9);
  add(guard, guard.events.stamp2, "stamp", 0.9);
  add(guard, guard.events.sign, "pen", 0.8);
  add(guard, guard.events.sign + 26, "coin", 0.5);
  const how = by("how");
  for (let i = 0; i < 6; i++) add(how, cue(how, "six") + i * 4, "tick", 0.4);
  for (let i = 0; i < 5; i++) add(how, cue(how, "five") + i * 4, "tick", 0.4);
  const proof = by("proof");
  add(proof, cue(proof, "5", 1), "stamp", 0.6);
  add(proof, cue(proof, "all"), "stamp", 0.85);
  add(proof, cue(proof, "13"), "pen", 0.7);
  const close = by("close");
  add(close, cue(close, "countersign"), "pen", 0.8);

  return { shots, sfx, capture, total: at };
}
