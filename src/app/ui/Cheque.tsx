import { band, bandV, MARK_PATHS, SEAL_PATHS, wave } from "./guilloche";

export type ChequeState = "idle" | "checking" | "sign" | "hold" | "block";

const ENGRAVE = "#1f5a45";

function tile(width: number, height: number, paths: string[], stroke = ENGRAVE, strokeWidth = 0.7, opacity = 0.75): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' viewBox='0 0 ${width} ${height}'><g fill='none' stroke='${stroke}' stroke-width='${strokeWidth}' opacity='${opacity}'>${paths.map((d) => `<path d='${d}'/>`).join("")}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

// One wavelength of each braid, so the tiles repeat without a seam at any cheque size.
const BAND_H = tile(28, 12, [...band(0, 28, 6, 4.4, 28, 4), ...band(0, 28, 6, 2.2, 14, 2)]);
const BAND_V = tile(12, 28, [...bandV(0, 28, 6, 4.4, 28, 4), ...bandV(0, 28, 6, 2.2, 14, 2)]);
const SAFETY = tile(36, 7, [wave(0, 36, 3.5, 1.5, 36)], ENGRAVE, 0.5, 0.2);

export function Mark({ size = 28, spin = false, className = "" }: { size?: number; spin?: boolean; className?: string }) {
  return (
    <svg className={`mark ${spin ? "mark-spin" : ""} ${className}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      {MARK_PATHS.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth={i === 0 ? 1.6 : 1.3} />
      ))}
    </svg>
  );
}

export interface ChequeProps {
  serial: string;
  network: string;
  payee: string;
  amount: string;
  /** The price the listing showed, when it differs from the amount asked. */
  listed?: string | null;
  memo: string;
  /** The owner's task, written on the first signature line. */
  mandate: string;
  state: ChequeState;
  /** Who would have signed: "Countersign" or "limits only". */
  signedBy?: string;
  size?: "hero" | "slip";
  className?: string;
}

const STATE_LABEL: Record<ChequeState, string> = {
  idle: "Not yet presented",
  checking: "Being checked",
  sign: "Countersigned",
  hold: "Referred to the owner",
  block: "Payment stopped",
};

export function Cheque({ serial, network, payee, amount, listed, memo, mandate, state, signedBy = "Countersign", size = "slip", className = "" }: ChequeProps) {
  return (
    <article className={`cheque cheque-${size} ${className}`} data-state={state} aria-label={`Payment of ${amount} to ${payee}. ${state === "sign" && signedBy !== "Countersign" ? "Signed without being read" : STATE_LABEL[state]}.`}>
      <div className="cheque-safety" style={{ backgroundImage: SAFETY }} aria-hidden="true" />
      <div className="cheque-band cheque-band-t" style={{ backgroundImage: BAND_H }} aria-hidden="true" />
      <div className="cheque-band cheque-band-b" style={{ backgroundImage: BAND_H }} aria-hidden="true" />
      <div className="cheque-band cheque-band-l" style={{ backgroundImage: BAND_V }} aria-hidden="true" />
      <div className="cheque-band cheque-band-r" style={{ backgroundImage: BAND_V }} aria-hidden="true" />

      <div className="cheque-inner">
        <header className="cheque-head">
          <div className="cheque-issuer">
            <Mark size={size === "hero" ? 30 : 22} />
            <div>
              <strong>Countersign</strong>
              <span>Agent payment cheque</span>
            </div>
          </div>
          <div className="cheque-no">
            <span>No. {serial}</span>
            <span>{network}</span>
          </div>
        </header>

        <div className="cheque-body">
          <svg className="cheque-seal" viewBox="0 0 120 120" aria-hidden="true">
            {SEAL_PATHS.map((d, i) => (
              <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth={0.8} />
            ))}
          </svg>
          <dl className="cheque-fields">
            <div className="cheque-field cheque-payee">
              <dt>Pay to</dt>
              <dd className="typed">{payee}</dd>
            </div>
            <div className="cheque-field cheque-amount">
              <dt>The sum of</dt>
              <dd className="typed">
                {amount}
                {listed ? <em>listed at {listed}</em> : null}
              </dd>
            </div>
            <div className="cheque-field cheque-memo">
              <dt>For</dt>
              <dd className="typed">{memo}</dd>
            </div>
          </dl>
        </div>

        <footer className="cheque-foot">
          <div className="cheque-sig">
            <p className="hand">{mandate}</p>
            <span>Signed by the owner: the mandate</span>
          </div>
          <div className="cheque-sig cheque-countersig">
            <p className="autograph" aria-hidden={state !== "sign"}>
              {/* Only a signed cheque carries the signature text, so the page text never shows one that was not given. */}
              <span>{state === "sign" ? signedBy : " "}</span>
            </p>
            <span>Countersign here before the payee is paid</span>
          </div>
        </footer>
      </div>

      <div className="cheque-checking" aria-hidden="true">
        <Mark size={size === "hero" ? 46 : 34} spin />
      </div>
      {/* Each stamp exists only in its own state; its landing animation runs when it appears. */}
      {state === "block" ? (
        <div className="stamp stamp-stop" aria-hidden="true">
          <span>Payment</span>
          <span>stopped</span>
        </div>
      ) : null}
      {state === "hold" ? (
        <div className="stamp stamp-drawer" aria-hidden="true">
          <span>Refer to</span>
          <span>drawer</span>
        </div>
      ) : null}
    </article>
  );
}
