import type { Check, CheckId, Receipt } from "@/lib/types";

export const CHECK_NAMES: Record<CheckId, string> = {
  network_asset: "Token and network",
  per_payment_limit: "Per-payment limit",
  budget: "Session budget",
  session: "Session window",
  quote: "Quote",
  payee: "Payee",
  purpose: "Purpose",
  merchant: "Merchant",
  instruction_origin: "Origin of the order",
  terms: "Terms",
  value: "Value",
};

export const DECISION_WORDS = { sign: "Countersigned", hold: "Refer to drawer", block: "Payment stopped" } as const;

const short = (s: string, head = 10, tail = 6) => (s.length > head + tail + 3 ? `${s.slice(0, head)}...${s.slice(-tail)}` : s);

function CheckRow({ c }: { c: Check }) {
  return (
    <li>
      <span className={`status status-${c.status}`}>{c.status}</span>
      <span className="name">
        {CHECK_NAMES[c.id]}
        <small>{c.by === "rule" ? "exact, in code" : "SERV Reasoning"}</small>
      </span>
      <span className="evidence">{c.evidence}</span>
    </li>
  );
}

export function ReceiptView({ receipt, open = false, title = "Receipt" }: { receipt: Receipt; open?: boolean; title?: string }) {
  const s = receipt.serv;
  // What went wrong comes first. The checks that passed are one click away.
  const flagged = receipt.checks.filter((c) => c.status !== "pass");
  const passed = receipt.checks.filter((c) => c.status === "pass");
  return (
    <details className="receipt" open={open}>
      <summary>
        <span>{title}</span>
        <span className={`verdict-tag verdict-${receipt.decision}`}>{DECISION_WORDS[receipt.decision]}</span>
      </summary>
      <p className="receipt-summary">{receipt.summary}</p>
      {flagged.length ? (
        <ul className="checks">
          {flagged.map((c) => (
            <CheckRow key={c.id} c={c} />
          ))}
        </ul>
      ) : null}
      {passed.length ? (
        <details className="checks-rest" open={!flagged.length && open}>
          <summary>{flagged.length ? `The other ${passed.length} checks passed` : `All ${passed.length} checks passed`}</summary>
          <ul className="checks">
            {passed.map((c) => (
              <CheckRow key={c.id} c={c} />
            ))}
          </ul>
        </details>
      ) : null}
      <dl className="receipt-foot">
        <div>
          <dt>SERV Reasoning</dt>
          <dd>{s.called ? `${s.model ?? "model"}${s.latencyMs !== undefined ? `, ${(s.latencyMs / 1000).toFixed(1)} s` : ""}` : "not called: an exact check decided"}</dd>
        </div>
        {s.called && s.promptTokens !== undefined ? (
          <div>
            <dt>Tokens</dt>
            <dd>
              {s.promptTokens} in, {s.completionTokens} out{s.estCostUsd !== undefined ? `, about $${s.estCostUsd.toFixed(5)}` : ""}
            </dd>
          </div>
        ) : null}
        {s.called && s.guardTripped ? (
          <div>
            <dt>Prompt guard</dt>
            <dd>fired on first reading, so the request was read again at higher effort</dd>
          </div>
        ) : null}
        <div>
          <dt>Bound to</dt>
          <dd>
            {short(receipt.binding.payTo)} for {receipt.binding.amount} units
          </dd>
        </div>
        <div>
          <dt>Signed by</dt>
          <dd title={receipt.signature}>
            {short(receipt.signer)} sig {short(receipt.signature, 8, 4)}
          </dd>
        </div>
        <div>
          <dt>Attempt digest</dt>
          <dd title={receipt.attemptDigest}>{short(receipt.attemptDigest, 10, 6)}</dd>
        </div>
      </dl>
    </details>
  );
}
