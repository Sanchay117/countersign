"use client";

import { useState } from "react";
import type { Decision, Receipt } from "@/lib/types";
import { DECISION_WORDS, ReceiptView } from "./ReceiptView";

export interface SuiteCase {
  id: string;
  title: string;
  tier: string;
  why: string;
  expect: Decision;
  /** The recorded result from the last full run, when there is one. */
  got: Decision | null;
}

export interface SuiteTier {
  tier: string;
  label: string;
  blurb: string;
}

type Live = { state: "running" } | { state: "done"; receipt: Receipt } | { state: "error"; message: string };

function CaseRow({ c }: { c: SuiteCase }) {
  const [live, setLive] = useState<Live | null>(null);

  const run = async () => {
    setLive({ state: "running" });
    try {
      const res = await fetch("/api/check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ caseId: c.id }) });
      const body = await res.json();
      if (!res.ok) setLive({ state: "error", message: body?.error ?? `The check failed (${res.status}).` });
      else setLive({ state: "done", receipt: body as Receipt });
    } catch {
      setLive({ state: "error", message: "The check could not be reached." });
    }
  };

  const shown = live?.state === "done" ? live.receipt.decision : c.got;
  return (
    <li className="case">
      <div className="case-row">
        <span className="id">{c.id}</span>
        <span className="title">
          {c.title}
          <small>{c.why}</small>
        </span>
        {shown ? (
          <span className={`verdict-tag verdict-${shown} ${shown !== c.expect ? "miss" : ""}`} title={shown !== c.expect ? `Expected: ${DECISION_WORDS[c.expect]}` : undefined}>
            {DECISION_WORDS[shown]}
          </span>
        ) : (
          <span className="verdict-tag" style={{ color: "var(--ink-faint)" }}>
            should be: {DECISION_WORDS[c.expect]}
          </span>
        )}
        <button className="link-btn" type="button" onClick={run} disabled={live?.state === "running"}>
          {live?.state === "running" ? "Checking" : live ? "Run again" : "Run it live"}
        </button>
      </div>
      {live?.state === "done" ? <ReceiptView receipt={live.receipt} open title="Live verdict" /> : null}
      {live?.state === "error" ? <p className="notice bad-notice">{live.message}</p> : null}
    </li>
  );
}

export function Suite({ cases, tiers }: { cases: SuiteCase[]; tiers: SuiteTier[] }) {
  return (
    <div className="suite">
      {tiers.map((t, i) => {
        const list = cases.filter((c) => c.tier === t.tier);
        const recorded = list.filter((c) => c.got !== null);
        const right = recorded.filter((c) => c.got === c.expect).length;
        return (
          <details className="suite-tier" key={t.tier} open={i === tiers.length - 1}>
            <summary>
              <h3>{t.label}</h3>
              <p>{t.blurb}</p>
              <span className="typed">{recorded.length ? `${right} of ${list.length} as expected` : `${list.length} cases`}</span>
            </summary>
            <ul>
              {list.map((c) => (
                <CaseRow key={c.id} c={c} />
              ))}
            </ul>
          </details>
        );
      })}
    </div>
  );
}
