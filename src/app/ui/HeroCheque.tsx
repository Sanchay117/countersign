"use client";

import { useEffect, useState } from "react";
import { Cheque, type ChequeState } from "./Cheque";

interface Scene {
  serial: string;
  payee: string;
  amount: string;
  listed: string | null;
  memo: string;
  verdict: Exclude<ChequeState, "idle" | "checking">;
  word: string;
  line: string;
}

const MANDATE = "Get today's weather for Berlin. Cheapest option.";

// Three payments from the demo market. The same three happen for real in the live run below.
const SCENES: Scene[] = [
  {
    serial: "000412",
    payee: "Weatherly",
    amount: "$0.04",
    listed: "$0.0015",
    memo: "GET /weatherly/v1/forecast?city=Berlin",
    verdict: "block",
    word: "Payment stopped",
    line: "The listing said $0.0015. The paywall asked for $0.04. That is under the $0.05 limit, so the limit would have paid it.",
  },
  {
    serial: "000413",
    payee: "Open-Rneteo Weather",
    amount: "$0.0018",
    listed: null,
    memo: "GET /open-rneteo/v1/forecast?city=Berlin",
    verdict: "block",
    word: "Payment stopped",
    line: "Read the name again. It imitates Open-Meteo Weather, one row above it in the catalog. No number on this cheque is wrong.",
  },
  {
    serial: "000414",
    payee: "Open-Meteo Weather",
    amount: "$0.002",
    listed: null,
    memo: "GET /open-meteo/v1/forecast?city=Berlin",
    verdict: "sign",
    word: "Countersigned",
    line: "The right forecast, from the right merchant, at the quoted price. Signed, and settled on Kite.",
  },
];

const PRESENT_MS = 900;
const CHECK_MS = 1500;
const HOLD_MS = 5200;

export function HeroCheque({ network }: { network: string }) {
  const [index, setIndex] = useState(0);
  // The first cheque is rendered with its verdict already on it, so the page reads before any script runs.
  const [state, setState] = useState<ChequeState>(SCENES[0].verdict);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const scene = SCENES[index];
    let timer: ReturnType<typeof setTimeout>;
    if (state === "idle") timer = setTimeout(() => setState("checking"), PRESENT_MS);
    else if (state === "checking") timer = setTimeout(() => setState(scene.verdict), CHECK_MS);
    else
      timer = setTimeout(() => {
        setIndex((i) => (i + 1) % SCENES.length);
        setState("idle");
      }, HOLD_MS);
    return () => clearTimeout(timer);
  }, [index, state, paused]);

  const scene = SCENES[index];
  const settled = state !== "idle" && state !== "checking";

  return (
    <div className="hero-stage" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="hero-book">
        <Cheque key={scene.serial} size="hero" serial={scene.serial} network={network} payee={scene.payee} amount={scene.amount} listed={scene.listed} memo={scene.memo} mandate={MANDATE} state={state} />
      </div>
      <p className="hero-caption" data-state={settled ? state : "idle"} aria-live="polite">
        {settled ? (
          <>
            <b>{scene.word}</b>
            <span>{scene.line}</span>
          </>
        ) : (
          <>
            <b>{state === "checking" ? "Being read" : "Presented"}</b>
            <span>{state === "checking" ? "Six exact checks in code, then five judgment calls by SERV Reasoning." : `The agent wants to pay ${scene.payee} ${scene.amount}.`}</span>
          </>
        )}
      </p>
    </div>
  );
}
