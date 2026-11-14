// The film's scenes. Hook, How, Proof and Close are type and drawing. Name is built from the
// site's own cheque component. Footage plays the recording of the live site.

import type { CSSProperties } from "react";
import { AbsoluteFill, Easing, interpolate, OffthreadVideo, Sequence, spring, staticFile, useCurrentFrame } from "remotion";
import { cue, FPS, type Plan, type Shot } from "./plan.ts";
import { Cheque, Mark, type ChequeState } from "./site/Cheque.tsx";
import { C, F, REPO, SITE } from "./theme.ts";

const W = 1920;
const H = 1080;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.2, 0.8, 0.2, 1);

/** 0 to 1 over `d` frames starting at `at`. */
const rise = (f: number, at: number, d = 12) => interpolate(f, [at, at + d], [0, 1], { ...clamp, easing: ease });
const pop = (f: number, at: number) => spring({ frame: f - at, fps: FPS, config: { damping: 14, stiffness: 160, mass: 0.7 } });

const Paper = () => <AbsoluteFill style={{ background: `radial-gradient(1700px 900px at 50% -260px, #f3f5ea, transparent 70%), ${C.paper}` }} />;

const label: CSSProperties = { font: `400 23px/1.2 ${F.typed}`, letterSpacing: "0.14em", textTransform: "uppercase", color: C.soft };

/** The site's cheque at film size. `ink` and `write` drive the stamp and the signature by frame. */
function FilmCheque({ width, state, ink = 1, scale = 1, write = 1, style, ...props }: { width: number; state: ChequeState; ink?: number; scale?: number; write?: number; style?: CSSProperties } & Omit<Parameters<typeof Cheque>[0], "state" | "network" | "size">) {
  return (
    <div style={{ position: "absolute", width, ...style, ["--ink" as string]: ink, ["--slam" as string]: scale, ["--write" as string]: write }}>
      <Cheque {...props} state={state} network="Kite Testnet" size="hero" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Captions
// ---------------------------------------------------------------------------

export function Captions({ shot }: { shot: Shot }) {
  const f = useCurrentFrame();
  const words = shot.take.words;
  const chunks: { from: number; to: number }[] = [];
  let start = 0;
  words.forEach((w, i) => {
    const sentenceEnd = /[.?!]$/.test(w.text);
    const softEnd = /[,:]$/.test(w.text) && i - start >= 6;
    if (sentenceEnd || softEnd || i - start >= 11 || i === words.length - 1) {
      chunks.push({ from: start, to: i });
      start = i + 1;
    }
  });
  const frameOf = (i: number) => shot.voiceAt + Math.round(words[i].start * FPS);
  const current = chunks.filter((c) => f >= frameOf(c.from) - 4).at(-1);
  if (!current) return null;
  const last = shot.voiceAt + Math.round(words[current.to].end * FPS);
  const opacity = Math.min(rise(f, frameOf(current.from) - 4, 5), interpolate(f, [last + 14, last + 22], [1, 0], clamp));
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 56 }}>
      <div style={{ opacity, maxWidth: 1560, padding: "15px 34px 17px", background: "rgba(23,33,43,.93)", borderLeft: `6px solid ${C.engrave}`, font: `500 40px/1.3 ${F.text}`, color: C.sheet, textAlign: "center" }}>
        {words.slice(current.from, current.to + 1).map((w, i) => (
          <span key={i} style={{ opacity: f >= frameOf(current.from + i) - 1 ? 1 : 0.4 }}>
            {w.text}{" "}
          </span>
        ))}
      </div>
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------------------
// 1. The hook: the narration itself, set large
// ---------------------------------------------------------------------------

export function Hook({ shot }: { shot: Shot }) {
  const f = useCurrentFrame();
  const words = shot.take.words;
  const split = words.findIndex((w) => w.text.endsWith(".")) + 1;
  const frameOf = (i: number) => shot.voiceAt + Math.round(words[i].start * FPS);
  const hot = (i: number) => i >= split && ["how", "much.", "what", "for."].includes(words[i].text);
  const second = rise(f, frameOf(split) - 6, 10);
  const line = (from: number, to: number) =>
    words.slice(from, to).map((w, i) => {
      const t = rise(f, frameOf(from + i) - 2, 9);
      const h = hot(from + i);
      return (
        <span key={i} style={{ display: "inline-block", marginRight: "0.26em", opacity: t, transform: `translateY(${(1 - t) * 26}px)`, color: h ? C.engrave : C.ink, fontStyle: h ? "italic" : "normal" }}>
          {w.text}
        </span>
      );
    });
  return (
    <AbsoluteFill>
      <Paper />
      <div style={{ position: "absolute", left: 150, top: 140, ...label, opacity: rise(f, 2) }}>The problem</div>
      <div style={{ position: "absolute", left: 150, top: 205, width: 1620, font: `500 104px/1.07 ${F.display}`, letterSpacing: "-0.025em", opacity: 1 - second * 0.62 }}>{line(0, split)}</div>
      <div style={{ position: "absolute", left: 150, top: 600, width: 1620, font: `500 118px/1.05 ${F.display}`, letterSpacing: "-0.025em" }}>{line(split, words.length)}</div>
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------------------
// 2. The name: the wordmark and one cheque being countersigned
// ---------------------------------------------------------------------------

function Wordmark({ size, style }: { size: number; style?: CSSProperties }) {
  return (
    <div style={{ font: `italic 500 ${size}px/0.86 ${F.display}`, letterSpacing: "-0.045em", color: C.ink, ...style }}>
      Counter<span style={{ color: C.engrave }}>sign</span>
    </div>
  );
}

export function Name({ shot }: { shot: Shot }) {
  const f = useCurrentFrame();
  const mark = pop(f, 4);
  const line = rise(f, cue(shot, "second") - 6, 16);
  const cheque = pop(f, cue(shot, "second") - 2);
  const write = interpolate(f, [cue(shot, "signature"), cue(shot, "signature") + 28], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const kite = rise(f, cue(shot, "kite") - 4, 12);
  return (
    <AbsoluteFill>
      <Paper />
      <Wordmark size={300} style={{ position: "absolute", left: 136, top: 110, opacity: Math.min(1, mark * 1.4), transform: `translateY(${(1 - mark) * 40}px)` }} />
      <div style={{ position: "absolute", left: 150, top: 470, width: 700, opacity: line, transform: `translateY(${(1 - line) * 24}px)` }}>
        <div style={{ font: `500 72px/1.1 ${F.display}`, letterSpacing: "-0.02em", color: C.ink }}>The second signature on every payment your agent makes.</div>
        <div style={{ marginTop: 44, display: "inline-block", padding: "10px 18px 8px", border: `2px solid ${C.ink}`, ...label, color: C.ink, opacity: kite }}>On Kite, checked by SERV Reasoning</div>
      </div>
      <FilmCheque
        width={980}
        serial="000414"
        payee="Open-Meteo Weather"
        amount="$0.002"
        memo="GET /open-meteo/v1/forecast?city=Berlin"
        mandate="Get today's weather for Berlin. Cheapest option."
        state={f >= cue(shot, "signature") ? "sign" : "idle"}
        write={write}
        style={{ left: 870, top: 410, opacity: Math.min(1, cheque * 1.5), transform: `translateY(${(1 - cheque) * 60}px) rotate(-1.6deg)` }}
      />
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------------------
// 3. Footage of the live site
// ---------------------------------------------------------------------------

export function Footage({ shot, tag }: { shot: Shot; tag: string }) {
  const f = useCurrentFrame();
  const keys = shot.focus;
  const at = keys.map((k) => k.at);
  const track = (pick: (k: (typeof keys)[number]) => number) => (keys.length > 1 ? interpolate(f, at, keys.map(pick), { ...clamp, easing: Easing.inOut(Easing.cubic) }) : pick(keys[0]));
  const z = track((k) => k.z);
  const x = Math.min(0, Math.max(W * (1 - z), W * (0.5 - track((k) => k.cx) * z)));
  const y = Math.min(0, Math.max(H * (1 - z), H * (0.5 - track((k) => k.cy) * z)));
  // A brief wash of paper on every cut, so a jump in time reads as a cut and not a glitch.
  const flash = Math.max(0, ...shot.cuts.slice(1).map((cut) => interpolate(f, [cut.at - 1, cut.at, cut.at + 8], [0, 0.6, 0], clamp)));
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <div style={{ position: "absolute", width: W, height: H, transformOrigin: "0 0", transform: `translate(${x}px, ${y}px) scale(${z})` }}>
        {shot.cuts.map((cut, i) => (
          <Sequence key={i} from={cut.at} durationInFrames={cut.frames} layout="none">
            <OffthreadVideo src={staticFile("capture/site.mp4")} startFrom={Math.max(0, Math.round(cut.src * FPS))} muted style={{ width: W, height: H }} />
          </Sequence>
        ))}
      </div>
      <AbsoluteFill style={{ background: C.sheet, opacity: flash }} />
      <AbsoluteFill style={{ boxShadow: "inset 0 0 160px rgba(23,33,43,.22)" }} />
      <div style={{ position: "absolute", left: 44, top: 38, padding: "11px 18px 9px", background: "rgba(23,33,43,.92)", ...label, fontSize: 19, color: C.sheet, opacity: rise(f, 4) }}>
        <span style={{ color: "#e2584d" }}>&#9679;</span> {tag}
      </div>
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------------------
// 4. How a payment is read: the eleven checks
// ---------------------------------------------------------------------------

const CODE_CHECKS = ["Token and network", "Per-payment limit", "Session budget", "Session window", "Quote", "Payee"];
const SERV_CHECKS = ["Purpose", "Merchant", "Origin of the order", "Terms", "Value"];

function Column({ f, at, title, sub, items, colour, left, foot, footAt }: { f: number; at: number; title: string; sub: string; items: string[]; colour: string; left: number; foot: string; footAt: number }) {
  const head = rise(f, at - 8, 12);
  const footT = rise(f, footAt - 4, 14);
  return (
    <div style={{ position: "absolute", left, top: 250, width: 760 }}>
      <div style={{ opacity: head, transform: `translateY(${(1 - head) * 20}px)` }}>
        <div style={{ ...label, color: colour }}>{sub}</div>
        <div style={{ font: `500 76px/1.05 ${F.display}`, letterSpacing: "-0.02em", color: C.ink, marginTop: 8 }}>{title}</div>
      </div>
      <div style={{ marginTop: 30, borderTop: `2px solid ${C.ink}` }}>
        {items.map((item, i) => {
          const t = pop(f, at + i * 4);
          return (
            <div key={item} style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "baseline", padding: "13px 4px 11px", borderBottom: `1px solid ${C.rule}`, opacity: Math.min(1, t * 1.6), transform: `translateX(${(1 - t) * -36}px)` }}>
              <span style={{ font: `400 36px/1.2 ${F.typed}`, color: C.ink }}>{item}</span>
              <span style={{ ...label, fontSize: 20, color: colour }}>pass</span>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 26, font: `500 40px/1.25 ${F.text}`, color: colour, opacity: footT, transform: `translateY(${(1 - footT) * 16}px)` }}>{foot}</div>
    </div>
  );
}

export function How({ shot }: { shot: Shot }) {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Paper />
      <div style={{ position: "absolute", left: 150, top: 120, ...label, opacity: rise(f, 2) }}>How a payment is read</div>
      <Column f={f} at={cue(shot, "six")} title="Code does the arithmetic" sub="Six exact checks" items={CODE_CHECKS} colour={C.engrave} left={150} foot="No model is called. Cost: nothing." footAt={cue(shot, "nothing")} />
      <Column f={f} at={cue(shot, "five")} title="SERV does the judging" sub="Five judgment calls" items={SERV_CHECKS} colour={C.pen} left={1010} foot="Smallest model: about $0.0006 a check." footAt={cue(shot, "tenth")} />
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------------------
// 5. The proof: the recorded results of the trap suite
// ---------------------------------------------------------------------------

function Figure({ f, at, left, colour, n, of, title, note, cells }: { f: number; at: number; left: number; colour: string; n: number; of: number; title: string; note: string; cells: number }) {
  const t = pop(f, at);
  const count = Math.round(interpolate(f, [at, at + 18], [0, n], clamp));
  return (
    <div style={{ position: "absolute", left, top: 300, width: 520, opacity: Math.min(1, t * 1.5), transform: `translateY(${(1 - t) * 40}px)` }}>
      <div style={{ ...label, color: colour }}>{title}</div>
      <div style={{ font: `500 230px/0.95 ${F.display}`, letterSpacing: "-0.04em", color: colour, marginTop: 6 }}>
        {count}
        <span style={{ fontSize: 86, color: C.soft, letterSpacing: "-0.01em" }}> of {of}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cells > 20 ? 20 : cells}, 1fr)`, gap: 5, marginTop: 22 }}>
        {Array.from({ length: cells }, (_, i) => (
          <div key={i} style={{ height: 20, background: i < count ? colour : "transparent", border: `1.5px solid ${i < count ? colour : C.rule}` }} />
        ))}
      </div>
      <div style={{ font: `400 34px/1.3 ${F.text}`, color: C.soft, marginTop: 24 }}>{note}</div>
    </div>
  );
}

export function Proof({ shot }: { shot: Shot }) {
  const f = useCurrentFrame();
  const foot = rise(f, cue(shot, "13") + 30, 16);
  return (
    <AbsoluteFill>
      <Paper />
      <div style={{ position: "absolute", left: 150, top: 120, ...label, opacity: rise(f, 2) }}>54 test payments, answers written first</div>
      <div style={{ position: "absolute", left: 150, top: 170, font: `500 78px/1.05 ${F.display}`, letterSpacing: "-0.02em", color: C.ink, opacity: rise(f, 6, 14) }}>40 should never be signed. 14 must be.</div>
      <Figure f={f} at={cue(shot, "5", 1)} left={150} colour={C.stop} n={5} of={40} cells={40} title="Spending limits alone" note="bad payments stopped. The rest were under the limit." />
      <Figure f={f} at={cue(shot, "all")} left={720} colour={C.pen} n={40} of={40} cells={40} title="With Countersign" note="bad payments stopped. Same wallet, same limits." />
      <Figure f={f} at={cue(shot, "13")} left={1290} colour={C.engrave} n={13} of={14} cells={14} title="Good payments" note="still signed. A guard that blocks everything is useless." />
      <div style={{ position: "absolute", left: 150, top: 930, ...label, fontSize: 21, opacity: foot }}>One recorded run, 14 November 2026, on gpt-6-luna-serv-multipath with the prompt guard. Full results in the repository.</div>
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------------------
// 6. The close
// ---------------------------------------------------------------------------

export function Close({ shot }: { shot: Shot }) {
  const f = useCurrentFrame();
  const a = rise(f, cue(shot, "sign") - 4, 12);
  const b = rise(f, cue(shot, "countersign") - 4, 12);
  const write = interpolate(f, [cue(shot, "countersign"), cue(shot, "countersign") + 26], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const lines = rise(f, cue(shot, "time") + 14, 18);
  return (
    <AbsoluteFill>
      <Paper />
      <div style={{ position: "absolute", left: 150, top: 150, font: `500 170px/1 ${F.display}`, letterSpacing: "-0.035em", color: C.ink }}>
        <div style={{ opacity: a, transform: `translateY(${(1 - a) * 26}px)` }}>Sign once.</div>
        <div style={{ opacity: b, transform: `translateY(${(1 - b) * 26}px)` }}>
          <span style={{ fontStyle: "italic", color: C.pen, display: "inline-block", clipPath: `inset(-10% ${(1 - write) * 100}% -20% 0)` }}>Countersign</span> every time.
        </div>
      </div>
      <div style={{ position: "absolute", left: 150, top: 640, opacity: lines, transform: `translateY(${(1 - lines) * 24}px)` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, color: C.engrave }}>
          <Mark size={64} />
          <span style={{ font: `italic 500 76px/1 ${F.display}`, color: C.ink, letterSpacing: "-0.03em" }}>Countersign</span>
        </div>
        <div style={{ font: `700 46px/1.4 ${F.typed}`, color: C.pen, marginTop: 30 }}>{SITE}</div>
        <div style={{ font: `400 32px/1.6 ${F.typed}`, color: C.soft, marginTop: 6 }}>{REPO}</div>
        <div style={{ ...label, marginTop: 34 }}>Built for the SERV Hackathon, Edition 02. Kite track. Kite testnet, test money only.</div>
      </div>
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------------------
// The cover image
// ---------------------------------------------------------------------------

export function Thumbnail() {
  return (
    <AbsoluteFill>
      <Paper />
      <Wordmark size={292} style={{ position: "absolute", left: 104, top: 70 }} />
      <div style={{ position: "absolute", left: 120, top: 400, width: 760, font: `500 74px/1.08 ${F.display}`, letterSpacing: "-0.02em", color: C.ink }}>The second signature on every payment your AI agent makes.</div>
      <div style={{ position: "absolute", left: 120, top: 760, display: "flex", gap: 54, alignItems: "flex-end" }}>
        <div>
          <div style={{ font: `500 150px/0.9 ${F.display}`, letterSpacing: "-0.04em", color: C.stop }}>
            5<span style={{ fontSize: 60, color: C.soft }}> of 40</span>
          </div>
          <div style={{ ...label, marginTop: 10 }}>stopped by a spending limit</div>
        </div>
        <div>
          <div style={{ font: `500 150px/0.9 ${F.display}`, letterSpacing: "-0.04em", color: C.pen }}>
            40<span style={{ fontSize: 60, color: C.soft }}> of 40</span>
          </div>
          <div style={{ ...label, marginTop: 10 }}>stopped by Countersign</div>
        </div>
      </div>
      <FilmCheque width={920} serial="000412" payee="Weatherly" amount="$0.04" listed="$0.0015" memo="GET /weatherly/v1/forecast?city=Berlin" mandate="Get today's weather for Berlin. Cheapest option." state="block" style={{ left: 930, top: 330, transform: "rotate(-2.4deg)" }} />
    </AbsoluteFill>
  );
}

export function Scene({ shot }: { shot: Shot; plan: Plan }) {
  if (shot.id === "hook") return <Hook shot={shot} />;
  if (shot.id === "name") return <Name shot={shot} />;
  if (shot.id === "how") return <How shot={shot} />;
  if (shot.id === "proof") return <Proof shot={shot} />;
  if (shot.id === "close") return <Close shot={shot} />;
  return <Footage shot={shot} tag={shot.id === "run" ? "Real footage of the live site. Kite testnet." : "Real footage. Cut for time: the full run took about 30 seconds."} />;
}
