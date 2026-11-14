// The film's narration, in order. `text` is what the captions show; `say` (when set) is what the
// voice reads, spelled for the ear. scripts/voice.ts turns each entry into public/vo/<id>.wav and
// records its word timing in public/vo/manifest.json.

export interface Line {
  id: string;
  text: string;
  say?: string;
  /** Seconds of picture before the narrator starts. */
  lead?: number;
  /** Seconds of picture after the narrator stops. */
  tail?: number;
  /** Speeds the take up without changing its pitch. */
  tempo?: number;
}

export const SCRIPT: Line[] = [
  {
    id: "hook",
    text: "You gave your AI agent a wallet and a spending limit. The limit knows how much. It has no idea what for.",
    say: "You gave your A.I. agent a wallet, and a spending limit. The limit knows how much. It has no idea what for.",
    lead: 0.4,
    tail: 0.6,
  },
  {
    id: "name",
    text: "This is Countersign. The second signature on every payment your agent makes, on Kite.",
    lead: 0.5,
    tail: 0.8,
  },
  {
    id: "run",
    text: "Two agents get the same task: buy the cheapest Berlin forecast. The first has spending limits only. It pays a shop that listed a fraction of a cent, then charged four cents. Under the limit, so it went through.",
    lead: 0.5,
    tail: 0.7,
  },
  {
    id: "guard",
    text: "The second agent has Countersign. The bait and switch is stopped by an exact check in code. A look-alike merchant is caught by SERV Reasoning. The real one is signed, and settles on Kite.",
    say: "The second agent has Countersign. The bait and switch is stopped by an exact check in code. A look-alike merchant is caught by Serve Reasoning. The real one is signed, and settles on Kite.",
    lead: 0.4,
    tail: 0.9,
  },
  {
    id: "how",
    text: "Code does the arithmetic: six exact checks that cost nothing. SERV does the judging: five calls on its smallest model, for under a tenth of a cent.",
    say: "Code does the arithmetic: six exact checks, that cost nothing. Serve does the judging: five calls on its smallest model, for under a tenth of a cent.",
    lead: 0.5,
    tail: 0.7,
  },
  {
    id: "proof",
    text: "On 54 test payments, spending limits alone stopped 5 of 40 bad ones. Countersign stopped all 40, and still signed 13 of 14 good ones.",
    say: "On fifty four test payments, spending limits alone stopped five of forty bad ones. Countersign stopped all forty, and still signed thirteen of fourteen good ones.",
    lead: 0.5,
    tail: 0.8,
  },
  {
    id: "close",
    text: "Sign once. Countersign every time.",
    lead: 0.6,
    tail: 2.6,
  },
];
