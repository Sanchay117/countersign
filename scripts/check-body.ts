/**
 * Prints the JSON body for POST /v1/check from one case in the trap suite.
 *   npx tsx scripts/check-body.ts S01 > proof/check-body.json
 */
import { CASES } from "../src/lib/cases";

const id = process.argv[2] ?? "S01";
const c = CASES.find((k) => k.id === id);
if (!c) throw new Error(`unknown case ${id}`);
process.stdout.write(JSON.stringify({ mandate: c.mandate, attempt: c.attempt }));
