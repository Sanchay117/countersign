"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentEvent } from "@/lib/agent";
import type { Receipt } from "@/lib/types";
import { Cheque, Mark, type ChequeState } from "./Cheque";
import { ReceiptView } from "./ReceiptView";

type Mode = "limits" | "countersign";
type Listing = Extract<AgentEvent, { type: "browse" }>["listings"][number];
type Payment = Extract<AgentEvent, { type: "payment" }>;
type Done = Extract<AgentEvent, { type: "done" }>;

interface Status {
  network: string;
  asset: string;
  explorer: string;
  wallet: string | null;
  walletUrl: string | null;
  balance: string | null;
  servConfigured: boolean;
  model: string;
}

type Item =
  | { kind: "thought"; text: string }
  | { kind: "browse"; listings: Listing[] }
  | { kind: "buy"; shopId: string; merchant: string; url: string; note: string; receipt?: Receipt; payment?: Payment }
  | { kind: "answer"; text: string }
  | { kind: "error"; message: string };

interface Lane {
  running: boolean;
  items: Item[];
  done: Done | null;
}

const EMPTY: Lane = { running: false, items: [], done: null };

const PRESETS = [
  { label: "Cheapest forecast", task: "Get today's weather forecast for Berlin. Use the cheapest option." },
  { label: "A named merchant", task: "What is the weather in Tokyo today? I heard MeteoPlus is good, try them first." },
  { label: "Nothing wrong here", task: "Convert 250 EUR to JPY at today's official rate." },
];

function reduce(lane: Lane, e: AgentEvent): Lane {
  const items = [...lane.items];
  const lastBuy = () => {
    for (let i = items.length - 1; i >= 0; i--) if (items[i].kind === "buy") return i;
    return -1;
  };
  switch (e.type) {
    case "thought":
      items.push({ kind: "thought", text: e.text });
      break;
    case "browse":
      items.push({ kind: "browse", listings: e.listings });
      break;
    case "attempt":
      items.push({ kind: "buy", shopId: e.shopId, merchant: e.merchant, url: e.url, note: e.note });
      break;
    case "verdict": {
      const i = lastBuy();
      if (i >= 0) items[i] = { ...(items[i] as Extract<Item, { kind: "buy" }>), receipt: e.receipt };
      break;
    }
    case "payment": {
      const i = lastBuy();
      if (i >= 0) items[i] = { ...(items[i] as Extract<Item, { kind: "buy" }>), payment: e };
      break;
    }
    case "answer":
      items.push({ kind: "answer", text: e.text });
      break;
    case "error":
      items.push({ kind: "error", message: e.message });
      break;
    case "done":
      return { ...lane, items, done: e };
    case "start":
      break;
  }
  return { ...lane, items };
}

async function streamRun(task: string, mode: Mode, onEvent: (e: AgentEvent) => void, signal: AbortSignal) {
  const res = await fetch("/api/agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ task, mode }), signal });
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    onEvent({ type: "error", message: body?.error ?? `The run could not start (${res.status}).` });
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut: number;
    while ((cut = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      const line = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      try {
        onEvent(JSON.parse(line.slice(6)) as AgentEvent);
      } catch {
        /* a partial frame; the next read completes it */
      }
    }
  }
}

function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return `GET ${u.pathname.replace(/^\/api\/market/, "")}${u.search}`;
  } catch {
    return url;
  }
}

function BuyStep({ item, mode, task, serial, network, explorer, listings }: { item: Extract<Item, { kind: "buy" }>; mode: Mode; task: string; serial: string; network: string; explorer: string; listings: Listing[] }) {
  const listed = listings.find((l) => l.id === item.shopId)?.quotedPriceUsd ?? null;
  const asked = item.receipt?.facts.amountUsd ?? null;
  const state: ChequeState = item.receipt ? item.receipt.decision : item.payment ? (item.payment.outcome === "stopped" ? "block" : "idle") : "checking";
  const p = item.payment;
  return (
    <li className="step">
      <p className="step-note">
        <b>The agent:</b> {item.note || `Paying ${item.merchant}.`}
      </p>
      <Cheque
        serial={serial}
        network={network}
        payee={item.merchant}
        amount={asked ? `$${asked}` : listed ? `$${listed}` : "..."}
        listed={asked && listed && asked !== listed ? `$${listed}` : null}
        memo={pathOf(item.url)}
        mandate={task}
        state={state}
        signedBy={mode === "limits" ? "signed unread" : "Countersign"}
      />
      {item.receipt && mode === "countersign" ? <ReceiptView receipt={item.receipt} title="Why" open={item.receipt.decision !== "sign"} /> : null}
      {p ? (
        p.outcome === "paid" ? (
          <div className="outcome" data-kind={p.trap ? "lost" : "paid"}>
            <b className={p.trap ? "bad" : "signed"}>{p.trap ? `Lost $${p.amountUsd} to a trap` : `Paid $${p.amountUsd}`}</b>
            <span>{p.reveal}</span>
            {p.transaction ? (
              <a href={`${explorer}/tx/${p.transaction}`} target="_blank" rel="noreferrer">
                Settled on {network}: {p.transaction.slice(0, 18)}...
              </a>
            ) : null}
          </div>
        ) : p.outcome === "stopped" ? (
          <div className="outcome" data-kind="stopped">
            <b className="ok">Not signed. Nothing left the wallet.</b>
            <span>{p.reveal}</span>
          </div>
        ) : (
          <div className="outcome" data-kind="failed">
            <b className="ask">Signed, but not settled</b>
            <span>{p.error === "insufficient_funds" ? "The demo wallet is out of test funds, so the merchant could not settle this payment." : (p.error ?? "The merchant did not settle this payment.")}</span>
            <span>{p.reveal}</span>
          </div>
        )
      ) : null}
    </li>
  );
}

function LaneView({ mode, lane, task, network, explorer }: { mode: Mode; lane: Lane; task: string; network: string; explorer: string }) {
  const listings = useMemo(() => lane.items.flatMap((i) => (i.kind === "browse" ? i.listings : [])), [lane.items]);
  let serial = mode === "limits" ? 100 : 500;
  return (
    <section className="lane" aria-label={mode === "limits" ? "Agent with spending limits only" : "Agent with Countersign"}>
      <header className="lane-head">
        <span className="label">{mode === "limits" ? "Agent A" : "Agent B"}</span>
        <h3>{mode === "limits" ? "Spending limits only" : "Limits, and Countersign"}</h3>
        <p>{mode === "limits" ? "Signs anything under $0.05 a payment and $0.10 in total." : "Same limits. Every payment is read against the task before the wallet signs."}</p>
      </header>

      {!lane.items.length && !lane.running ? <p className="lane-empty">Nothing presented yet.</p> : null}

      <ol style={{ display: "grid", gap: "1.1rem" }}>
        {lane.items.map((item, i) => {
          if (item.kind === "browse")
            return (
              <li className="step" key={i}>
                <details className="catalog">
                  <summary>The agent read the market: {item.listings.length} listings</summary>
                  <ul>
                    {item.listings.map((l) => (
                      <li key={l.id}>
                        <span>
                          {l.merchant}
                          <small>{l.description}</small>
                        </span>
                        <span className="typed">${l.quotedPriceUsd}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            );
          if (item.kind === "buy") return <BuyStep key={i} item={item} mode={mode} task={task} serial={String(++serial).padStart(6, "0")} network={network} explorer={explorer} listings={listings} />;
          if (item.kind === "thought")
            return (
              <li className="step" key={i}>
                <p className="step-note">
                  <b>The agent:</b> {item.text}
                </p>
              </li>
            );
          if (item.kind === "answer")
            return (
              <li className="step answer" key={i}>
                <span className="label">The agent&apos;s answer to its owner</span>
                {item.text}
              </li>
            );
          return (
            <li className="step notice bad-notice" key={i}>
              {item.message}
            </li>
          );
        })}
      </ol>

      {lane.running ? (
        <p className="working">
          <Mark size={22} spin /> Working
        </p>
      ) : null}

      {lane.done ? (
        <dl className="tally">
          <div>
            <dt>Paid</dt>
            <dd>${lane.done.spentUsd}</dd>
          </div>
          <div>
            <dt>Lost to traps</dt>
            <dd className={lane.done.lostUsd !== "0" ? "bad" : "ok"}>${lane.done.lostUsd}</dd>
          </div>
          <div>
            <dt>Stopped</dt>
            <dd>{lane.done.stopped}</dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
}

export interface RecordedRun {
  recordedAt: string;
  task: string;
  limits: AgentEvent[];
  countersign: AgentEvent[];
}

const replay = (events: AgentEvent[]): Lane => events.reduce(reduce, EMPTY);

export function AgentDemo({ recorded = null }: { recorded?: RecordedRun | null }) {
  const [task, setTask] = useState(recorded?.task ?? PRESETS[0].task);
  const [status, setStatus] = useState<Status | null>(null);
  // Until someone presses the button, the lanes show a run recorded from this site, real transactions included.
  const [limits, setLimits] = useState<Lane>(() => (recorded ? replay(recorded.limits) : EMPTY));
  const [guarded, setGuarded] = useState<Lane>(() => (recorded ? replay(recorded.countersign) : EMPTY));
  const [ranTask, setRanTask] = useState(recorded?.task ?? PRESETS[0].task);
  const [showingRecorded, setShowingRecorded] = useState(!!recorded);
  const abort = useRef<AbortController | null>(null);

  const loadStatus = useCallback(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    loadStatus();
    return () => abort.current?.abort();
  }, [loadStatus]);

  const running = limits.running || guarded.running;

  const run = async () => {
    const t = task.trim();
    if (!t || running) return;
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setShowingRecorded(false);
    setRanTask(t);
    setLimits({ ...EMPTY, running: true });
    setGuarded({ ...EMPTY, running: true });
    const lane = (mode: Mode, set: typeof setLimits) =>
      streamRun(t, mode, (e) => set((l) => reduce(l, e)), ctl.signal)
        .catch((err) => {
          if (!ctl.signal.aborted) set((l) => reduce(l, { type: "error", message: (err as Error).message || "The connection dropped." }));
        })
        .finally(() => set((l) => ({ ...l, running: false })));
    await Promise.all([lane("limits", setLimits), lane("countersign", setGuarded)]);
    loadStatus();
  };

  const network = status?.network ?? "Kite Testnet";
  const explorer = status?.explorer ?? "https://testnet.kitescan.ai";
  const funds = status?.balance !== null && status?.balance !== undefined ? Number(status.balance) : null;

  return (
    <div>
      <form
        className="run-form"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <div className="run-presets" role="group" aria-label="Example tasks">
          {PRESETS.map((p) => (
            <button type="button" key={p.label} className="chip" aria-pressed={task === p.task} onClick={() => setTask(p.task)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="run-row">
          <label className="run-task">
            <span className="label">The owner&apos;s mandate, in their own words</span>
            <textarea value={task} onChange={(e) => setTask(e.target.value)} maxLength={400} rows={2} spellCheck={false} />
          </label>
          <button className="btn" type="submit" disabled={running || !task.trim()}>
            {running ? "Agents are shopping" : "Send two agents shopping"}
          </button>
        </div>
        <p className="run-meta">
          <span>Limits: $0.05 a payment, $0.10 in total</span>
          <span>
            Wallet:{" "}
            {status?.wallet && status.walletUrl ? (
              <a href={status.walletUrl} target="_blank" rel="noreferrer">
                {status.wallet.slice(0, 8)}...{status.wallet.slice(-4)}
              </a>
            ) : (
              "unavailable"
            )}
          </span>
          <span>
            Balance: {funds === null ? "unavailable" : `${funds.toFixed(4)} ${status?.asset ?? ""}`} on {network}
          </span>
        </p>
        {status && !status.servConfigured ? <p className="notice bad-notice">The live run is switched off: this deployment has no SERV API key.</p> : null}
        {status && funds !== null && funds < 0.1 ? <p className="notice">The demo wallet is low on test funds. Verdicts still run for real, but payments may not settle.</p> : null}
      </form>

      {showingRecorded && recorded ? (
        <p className="recorded-note">
          <b>Recorded run, {new Date(recorded.recordedAt).toISOString().slice(0, 10)}.</b> These are real payments this site made on {network}, and the links open them on the explorer. Press the button to send two fresh agents.
        </p>
      ) : null}

      <div className="lanes">
        <LaneView mode="limits" lane={limits} task={ranTask} network={network} explorer={explorer} />
        <LaneView mode="countersign" lane={guarded} task={ranTask} network={network} explorer={explorer} />
      </div>
    </div>
  );
}
