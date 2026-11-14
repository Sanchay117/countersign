import { headers } from "next/headers";
import bench from "@/data/bench.json";
import run from "@/data/run.json";
import { CASES, CASE_TIERS } from "@/lib/cases";
import { LIMIT_RULES, runRules } from "@/lib/rules";
import type { Decision, RuleCheckId } from "@/lib/types";
import { AgentDemo, type RecordedRun } from "./ui/AgentDemo";
import { Mark } from "./ui/Cheque";
import { HeroCheque } from "./ui/HeroCheque";
import { Suite, type SuiteCase } from "./ui/Suite";

export const dynamic = "force-dynamic";

interface BenchTotals {
  cases: number;
  exact: number;
  traps: number;
  trapsStopped: number;
  clean: number;
  cleanSigned: number;
  servCalls: number;
  guardTrips: number;
  latencyP50Ms: number | null;
  estCostPerServCheckUsd: number | null;
}
interface BenchFile {
  ranAt: string | null;
  model: string | null;
  features: string[];
  totals: BenchTotals | null;
  rows: { id: string; got: Decision }[];
}

const CHECKS: { name: string; question: string; by: "code" | "SERV" }[] = [
  { name: "Token and network", question: "Is this the stablecoin Kite settles?", by: "code" },
  { name: "Per-payment limit", question: "Is the amount under the cap?", by: "code" },
  { name: "Session budget", question: "Does the total stay inside the budget?", by: "code" },
  { name: "Session window", question: "Is the session still open?", by: "code" },
  { name: "Quote", question: "Does the paywall ask more than the listing showed?", by: "code" },
  { name: "Payee", question: "Is this the address the catalog registered?", by: "code" },
  { name: "Purpose", question: "Does this purchase carry out the task?", by: "SERV" },
  { name: "Merchant", question: "Is the payee who the agent thinks it is?", by: "SERV" },
  { name: "Origin of the order", question: "Did the reason to pay come from the owner, or from the seller's text?", by: "SERV" },
  { name: "Terms", question: "One payment, or a subscription in disguise?", by: "SERV" },
  { name: "Value", question: "Is the price in line with what else was on offer?", by: "SERV" },
];

/** The two code-only layers are exact, so they are computed here rather than recorded. */
function staticLayers() {
  const traps = CASES.filter((c) => c.expect !== "sign");
  let limits = 0;
  let rules = 0;
  for (const c of traps) {
    const r = runRules(c.mandate, c.attempt);
    if (r.checks.some((k) => LIMIT_RULES.includes(k.id as RuleCheckId) && k.status === "fail")) limits++;
    if (r.failed) rules++;
  }
  return { traps: traps.length, limits, rules, clean: CASES.length - traps.length };
}

export default async function Page() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3210";
  const origin = (process.env.PUBLIC_ORIGIN ?? "").trim() || `${host.startsWith("localhost") ? "http" : "https"}://${host}`;
  const network = (process.env.KITE_NETWORK ?? "testnet") === "mainnet" ? "Kite Mainnet" : "Kite Testnet";
  const price = (process.env.CHECK_PRICE_USD ?? "").trim() || "0.005";
  const repo = (process.env.NEXT_PUBLIC_REPO_URL ?? "").trim();

  const b = bench as BenchFile;
  const t = b.totals;
  const layers = staticLayers();
  const got = new Map(b.rows.map((r) => [r.id, r.got]));
  const suiteCases: SuiteCase[] = CASES.map((c) => ({ id: c.id, title: c.title, tier: c.tier, why: c.why, expect: c.expect, got: got.get(c.id) ?? null }));
  const ranOn = b.ranAt ? new Date(b.ranAt).toISOString().slice(0, 10) : null;
  const recorded = (run as unknown as RecordedRun).recordedAt ? (run as unknown as RecordedRun) : null;

  return (
    <>
      <header className="wrap mast">
        <a className="mast-brand" href="#top">
          <Mark size={26} /> Countersign
        </a>
        <nav className="mast-links" aria-label="Sections">
          <a href="#run">Live run</a>
          <a href="#how">How it reads</a>
          <a href="#proof">Proof</a>
          {repo ? <a href={repo}>Code</a> : null}
          <span className="label mast-net">{network}</span>
        </nav>
      </header>

      <main id="top">
        <section className="wrap hero">
          <h1 className="wordmark" aria-label="Countersign">
            Counter<span>sign</span>
          </h1>
          <div className="hero-grid">
            <div className="hero-copy">
              <p className="hero-line">The second signature on every payment your AI agent makes.</p>
              <p className="hero-sub">
                A spending limit knows how much. It cannot know what for. Countersign reads each x402 payment on Kite against the task you gave, with SERV Reasoning, before the wallet signs.
              </p>
              <div className="hero-actions">
                <a className="btn" href="#run">
                  Send two agents shopping
                </a>
                <a className="btn btn-quiet" href="#proof">
                  See the {layers.traps} traps
                </a>
              </div>
            </div>
            <HeroCheque network={network} />
          </div>

          <dl className="hero-facts">
            <div>
              <dt>Stopped by a spending limit</dt>
              <dd>
                {layers.limits} of {layers.traps}
                <small>bad payments in the trap suite</small>
              </dd>
            </div>
            <div>
              <dt>Stopped by Countersign</dt>
              <dd>
                {t ? `${t.trapsStopped} of ${t.traps}` : "not run yet"}
                <small>{t ? "the same payments, same limits" : "add a SERV key and run npm run bench"}</small>
              </dd>
            </div>
            <div>
              <dt>Clean payments signed</dt>
              <dd>
                {t ? `${t.cleanSigned} of ${t.clean}` : `${layers.clean} to sign`}
                <small>a guard that blocks everything is useless</small>
              </dd>
            </div>
            <div>
              <dt>Price of a check</dt>
              <dd>
                ${price}
                <small>paid over x402 on Kite, settled only when a verdict comes back</small>
              </dd>
            </div>
          </dl>
        </section>

        <section className="section" id="turn">
          <div className="wrap">
            <div className="section-head">
              <span className="label">The problem</span>
              <h2>
                Under the limit. <em>Still wrong.</em>
              </h2>
              <p>One payment from the market below. The agent was told to buy the cheapest Berlin forecast. Weatherly listed one at $0.0015, then asked for $0.04 at the paywall.</p>
            </div>
            <div className="turn-grid">
              <div className="turn-col">
                <span className="label">What a spending limit sees</span>
                <h3>Four questions, four yeses.</h3>
                <ul className="turn-rows">
                  <li>
                    <span>$0.04 is under $0.05 a payment</span>
                    <span className="ok">pass</span>
                  </li>
                  <li>
                    <span>$0.04 fits a $0.10 budget</span>
                    <span className="ok">pass</span>
                  </li>
                  <li>
                    <span>The token is pieUSD on Kite</span>
                    <span className="ok">pass</span>
                  </li>
                  <li>
                    <span>The session is still open</span>
                    <span className="ok">pass</span>
                  </li>
                </ul>
                <p className="turn-result bad">Signs. $0.04 is gone.</p>
              </div>
              <div className="turn-col">
                <span className="label">What Countersign reads</span>
                <h3>The cheque itself.</h3>
                <ul className="turn-rows">
                  <li>
                    <span>The listing said $0.0015. The paywall asks $0.04.</span>
                    <span className="bad">fail</span>
                  </li>
                  <li>
                    <span>Caught by an exact check in code. No model was asked, so it cost nothing.</span>
                    <span>0 tokens</span>
                  </li>
                </ul>
                <p className="turn-result ok">Payment stopped. Nothing leaves the wallet.</p>
              </div>
            </div>
            <p style={{ marginTop: "1.4rem", maxWidth: "46rem", color: "var(--ink-soft)" }}>
              Most traps are not this easy. A look-alike name, an instruction planted in a listing or a subscription sold as a single purchase has no wrong number in it. Those are judgment calls, and they go to SERV Reasoning.
            </p>
          </div>
        </section>

        <section className="section" id="run">
          <div className="wrap">
            <div className="section-head">
              <span className="label">The real thing</span>
              <h2>
                Two agents, one task, <em>nine merchants.</em>
              </h2>
              <p>
                Both agents run on SERV Reasoning and shop the same market with real payments on {network}. Three merchants are honest. Six each run one trap that fits inside the spending limits. The only difference between the agents is the second signature.
              </p>
            </div>
            <AgentDemo recorded={recorded} />
          </div>
        </section>

        <section className="section thread">
          <div className="wrap">
            <div className="thread-grid">
              <p className="thread-year" aria-hidden="true">
                1891
              </p>
              <div className="thread-story">
                <span className="label">Where the idea comes from</span>
                <p>In 1891 Marcellus Berry of American Express had to solve money that travels without its owner.</p>
                <p>His answer was two signatures. You signed each cheque once, when you bought it. You signed it again, in front of the merchant, when you spent it. The merchant paid only if the two matched.</p>
                <p>An AI agent is money travelling without its owner. Countersign is the second signature.</p>
              </div>
            </div>
            <dl className="thread-map">
              <div>
                <dt>First signature</dt>
                <dd>The mandate: your task in your own words, with the limits you approved.</dd>
              </div>
              <div>
                <dt>The merchant&apos;s demand</dt>
                <dd>The x402 challenge: who to pay, how much, in which token.</dd>
              </div>
              <div>
                <dt>Countersignature</dt>
                <dd>A verdict that the demand matches the mandate, signed with EIP-712 and bound to that one payment.</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="section" id="how">
          <div className="wrap">
            <div className="section-head">
              <span className="label">How a payment is read</span>
              <h2>
                Code does the arithmetic. <em>SERV does the judging.</em>
              </h2>
            </div>
            <div className="how">
              <ol className="how-steps">
                <li>
                  <h3>The merchant answers 402</h3>
                  <p>Every x402 seller on Kite replies with a challenge: payee, amount, token. Until now the wallet asked one thing, whether the amount fits.</p>
                </li>
                <li>
                  <h3>Six exact checks run in code</h3>
                  <p>Token, limits, budget, session, quote and payee. A failure stops the payment at once and costs nothing, because no model is called. Code also measures how closely the payee&apos;s name resembles the other merchants in view.</p>
                </li>
                <li>
                  <h3>SERV Reasoning makes five judgment calls</h3>
                  <p>One request on SERV&apos;s smallest model: a fixed policy, a strict output schema, the prompt guard, and Multipath for a policy that branches. If the guard fires, the payment is read a second time at higher effort.</p>
                </li>
                <li>
                  <h3>The wallet signs, or it does not</h3>
                  <p>The decision rule lives in code. The verdict comes back as a signed receipt bound to that payment, valid for five minutes.</p>
                </li>
              </ol>
              <div style={{ display: "grid", gap: "1.2rem", alignContent: "start" }}>
                <div className="ledger">
                  <div className="ledger-head">
                    <span className="label">The eleven checks</span>
                    <span className="label">Read by</span>
                  </div>
                  <ul>
                    {CHECKS.map((c) => (
                      <li key={c.name}>
                        <span>{c.name}</span>
                        <span>{c.question}</span>
                        <span className={c.by === "SERV" ? "signed" : ""}>{c.by}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="ledger-rule">
                    Any fail: <b className="bad">payment stopped</b>. Any warning: <b className="ask">refer to drawer</b>, which is bank wording for &ldquo;ask the owner&rdquo;. All eleven pass: <b className="signed">countersigned</b>.
                  </p>
                </div>
                <pre className="code" aria-label="Integration code">
                  <span className="c">{"// One hook on the standard x402 client. It runs after the\n// merchant's 402 arrives and before the wallet signs.\n"}</span>
                  {"client."}
                  <span className="k">onBeforePaymentCreation</span>
                  {"(async (ctx) => {\n  const receipt = await "}
                  <span className="k">countersign</span>
                  {"(mandate, attemptFrom(ctx));\n  if (receipt.decision !== "}
                  <span className="s">{'"sign"'}</span>
                  {")\n    return { abort: true, reason: receipt.summary };\n});"}
                </pre>
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="proof">
          <div className="wrap">
            <div className="section-head">
              <span className="label">Proof</span>
              <h2>
                {CASES.length} payments. <em>Answers written first.</em>
              </h2>
              <p>Each case is a real x402 challenge on Kite with the right answer fixed before any model saw it. {layers.traps} should not be signed. {layers.clean} must be. Open a case and run it live against SERV Reasoning.</p>
            </div>

            <div className="proof-figures">
              <div className="bad">
                <span className="label">Spending limits alone</span>
                <p className="big">
                  {layers.limits}
                  <small> of {layers.traps}</small>
                </p>
                <p>bad payments stopped. The rest are under the limit, so they are signed.</p>
              </div>
              <div className="mid">
                <span className="label">Add the exact checks</span>
                <p className="big">
                  {layers.rules}
                  <small> of {layers.traps}</small>
                </p>
                <p>stopped once the quote and the payee are compared in code.</p>
              </div>
              <div className="good">
                <span className="label">Add SERV Reasoning</span>
                <p className="big">
                  {t ? t.trapsStopped : "?"}
                  <small> of {layers.traps}</small>
                </p>
                <p>{t ? `stopped, with ${t.cleanSigned} of ${t.clean} clean payments still signed.` : "Not recorded on this deployment yet."}</p>
              </div>
            </div>

            {t ? (
              <dl className="proof-notes">
                <div>
                  <dt>Exact answer</dt>
                  <dd>
                    <b>
                      {t.exact} of {t.cases}
                    </b>{" "}
                    cases got exactly the expected verdict: sign, refer or stop.
                  </dd>
                </div>
                <div>
                  <dt>Model</dt>
                  <dd>
                    <b>{b.model}</b>, {b.features.join(", ")}.
                  </dd>
                </div>
                <div>
                  <dt>Cost and speed</dt>
                  <dd>
                    {t.estCostPerServCheckUsd !== null ? (
                      <>
                        About <b>${t.estCostPerServCheckUsd.toFixed(4)}</b> in tokens per SERV check
                      </>
                    ) : (
                      "Token cost not reported"
                    )}
                    {t.latencyP50Ms !== null ? `, median ${(t.latencyP50Ms / 1000).toFixed(1)} s` : ""}. {t.cases - t.servCalls} cases never reached a model.
                  </dd>
                </div>
                <div>
                  <dt>Recorded</dt>
                  <dd>
                    {ranOn}, one full run, no retries. Reproduce it with <b>npm run bench</b>.
                  </dd>
                </div>
              </dl>
            ) : null}

            <Suite cases={suiteCases} tiers={CASE_TIERS} />
          </div>
        </section>

        <section className="section close">
          <div className="wrap">
            <p className="close-line">
              Sign once. <em>Countersign</em> every time.
            </p>
            <div className="close-grid">
              <div>
                <p>Countersign is a paid x402 service on Kite. Ask it with no payment and it answers with a Kite challenge, like every other service in the catalog. A Kite Passport agent pays it from its spending session.</p>
                <pre className="code" aria-label="Calling the paid API">
                  <span className="c">{"# ask without paying: 402 and a Kite payment challenge\n"}</span>
                  {`curl -i -X POST ${origin}/v1/check \\\n  -H "content-type: application/json" \\\n  -d '{"mandate": {...}, "attempt": {...}}'\n\n`}
                  <span className="c">{`# $${price} a check, settled only if a verdict comes back`}</span>
                </pre>
              </div>
              <div>
                <p>Or build it into the wallet. The guard is one hook on the standard x402 client, so it works with any merchant that speaks x402, with no change on the merchant&apos;s side.</p>
                <div className="hero-actions">
                  <a className="btn" href="#run">
                    Run it again
                  </a>
                  {repo ? (
                    <a className="btn btn-quiet" href={repo}>
                      Read the code
                    </a>
                  ) : null}
                  <a className="btn btn-quiet" href="/healthz">
                    Service status
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="wrap colophon">
        <div>
          <p>Built for the SERV Hackathon, Edition 02, on the Kite track. Runs on {network} with pieUSD, a test token with no value.</p>
          <p>The six trap merchants are part of this demo. They are labelled as traps after each run, and they pay this project&apos;s own test addresses.</p>
        </div>
        <div>
          <p>The two-signature cheque: Marcellus Berry, American Express, 1891. Countersign is not affiliated with American Express.</p>
          <p>Set in Bodoni Moda, Instrument Sans, Courier Prime, Caveat and Mrs Saint Delafield. The borders are computed from a formula, the way a geometric lathe cut them.</p>
        </div>
      </footer>
    </>
  );
}
