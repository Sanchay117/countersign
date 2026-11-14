// Films the live site with Chrome's screencast, resampled to a constant 30 fps and encoded by
// ffmpeg. Writes public/capture/site.mp4 and public/capture/site.json (the offsets the film cuts
// on, and where things are on screen).
//
// Everything in the footage is real: it opens the deployed site, presses "Send two agents
// shopping" and films both agents as they run on SERV Reasoning and pay over x402 on Kite
// testnet. One run costs a few cents of test pieUSD and well under a cent of SERV credit.
//
//   node scripts/capture.ts [origin]

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "capture");
mkdirSync(outDir, { recursive: true });

const origin = (process.argv[2] ?? "https://countersign-ten-xi.vercel.app").replace(/\/$/, "");

const FPS = 30;
const VIEW = { width: 1600, height: 900 };
const SCALE = 1.2; // 1920 x 1080 frames

// ---- constant-rate recording ----
const ffmpeg = spawn(
  "ffmpeg",
  ["-y", "-loglevel", "error", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", String(FPS), "-i", "-",
   "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
   join(outDir, "site.mp4")],
  { stdio: ["pipe", "inherit", "inherit"] },
);

// The screencast only sends a frame when the page changes, so each frame is repeated until
// the next one's timestamp.
let t0 = 0;
let clockOffset = 0;
let written = 0;
let last: Buffer | null = null;
const fill = (until: number) => {
  const target = Math.floor((until - t0) * FPS);
  while (last && written < target) {
    ffmpeg.stdin.write(last);
    written++;
  }
};

const marks: Record<string, number> = {};
const now = () => Math.round((Date.now() / 1000 - clockOffset - t0) * 100) / 100;
const mark = (id: string) => {
  marks[id] = now();
  console.log(`${marks[id].toFixed(2).padStart(7)}s  ${id}`);
};
const hold = (ms: number) => new Promise((r) => setTimeout(r, ms));

// A pointer drawn into the page, because a headless browser has none.
const pointer = `
  window.addEventListener("DOMContentLoaded", () => {
    const dot = document.createElement("div");
    dot.id = "film-pointer";
    dot.style.cssText = "position:fixed;z-index:99999;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(28,63,159,.9);box-shadow:0 0 0 2px #f6f7ef,0 0 0 4px rgba(28,63,159,.3);pointer-events:none;transform:translate(800px,620px);transition:width .1s,height .1s,margin .1s";
    document.body.appendChild(dot);
    addEventListener("mousemove", (e) => { dot.style.transform = "translate(" + e.clientX + "px," + e.clientY + "px)"; }, true);
    addEventListener("mousedown", () => { dot.style.width = dot.style.height = "15px"; dot.style.margin = "-7.5px 0 0 -7.5px"; }, true);
    addEventListener("mouseup", () => { dot.style.width = dot.style.height = "22px"; dot.style.margin = "-11px 0 0 -11px"; }, true);
  });
`;

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: SCALE });
const page = await context.newPage();
page.on("pageerror", (error) => console.log("pageerror", error.message));
await page.addInitScript(pointer);
const cdp = await context.newCDPSession(page);

cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
  const ts = metadata.timestamp ?? Date.now() / 1000;
  if (!t0) {
    t0 = ts;
    clockOffset = Date.now() / 1000 - ts;
  }
  fill(ts);
  last = Buffer.from(data, "base64");
  await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
});

/** Move the pointer to an element and click it, the way a person would. */
async function tap(p: Page, selector: string) {
  const box = await p.locator(selector).first().boundingBox();
  if (!box) return false;
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 18 });
  await hold(160);
  await p.mouse.down();
  await hold(70);
  await p.mouse.up();
  return true;
}

/** Where an element is, as fractions of the viewport. */
async function rect(p: Page, selector: string) {
  const box = await p.locator(selector).first().boundingBox();
  if (!box) return null;
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return { x: r(box.x / VIEW.width), y: r(box.y / VIEW.height), w: r(box.width / VIEW.width), h: r(box.height / VIEW.height) };
}

/** Scroll so an element's top sits `offset` px below the top of the window. */
const scrollToTop = (p: Page, selector: string, offset = 24) =>
  p.evaluate(
    ([s, o]) => {
      const el = document.querySelector(s as string);
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - (o as number), behavior: "smooth" });
    },
    [selector, offset] as const,
  );

const state = (p: Page) =>
  p.evaluate(() => {
    const lanes = [...document.querySelectorAll(".lanes .lane")];
    const of = (lane: Element | undefined) => ({
      cheques: [...(lane?.querySelectorAll(".cheque") ?? [])].map((c) => c.getAttribute("data-state")),
      outcomes: [...(lane?.querySelectorAll(".outcome") ?? [])].map((o) => o.getAttribute("data-kind")),
      done: !!lane?.querySelector(".tally"),
      error: lane?.querySelector(".bad-notice")?.textContent ?? null,
    });
    return { a: of(lanes[0]), b: of(lanes[1]), recorded: !!document.querySelector(".recorded-note"), paused: document.querySelector(".run-form ~ .notice")?.textContent ?? null };
  });

const rects: Record<string, unknown> = {};
const LANE_A = ".lanes .lane:nth-child(1)";
const LANE_B = ".lanes .lane:nth-child(2)";

try {
  await page.goto(`${origin}/`, { waitUntil: "load" });
  await page.waitForSelector(".cheque", { timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
  await hold(1200);

  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: VIEW.width * SCALE, maxHeight: VIEW.height * SCALE, everyNthFrame: 1 });
  await hold(600);
  mark("start");
  await hold(5200);

  // Down to the form, then press the button.
  await scrollToTop(page, "#run .run-form", 150);
  await hold(1600);
  mark("form");
  rects.form = await rect(page, "#run .run-form");
  await hold(1200);
  await tap(page, "#run .run-form .btn[type=submit]");
  mark("sent");
  await hold(500);
  // The pointer has done its one job. Take it off the picture so it does not sit on a cheque.
  await page.evaluate(() => document.getElementById("film-pointer")?.remove());
  await scrollToTop(page, ".lanes", 20);
  await hold(1300);
  mark("lanes");
  rects.laneA = await rect(page, LANE_A);
  rects.laneB = await rect(page, LANE_B);

  // Film both agents. The view stays on the top of the lanes until agent A is done, then
  // follows agent B's newest cheque.
  const seen = { stop1: false, lost: false, stop2: false, signed: false, paid: false };
  let follow = false;
  const deadline = Date.now() + 150_000;
  while (Date.now() < deadline) {
    const s = await state(page);
    if (s.paused) throw new Error(`live runs are paused: ${s.paused}`);
    if (s.a.error || s.b.error) throw new Error(`a lane failed: ${s.a.error ?? s.b.error}`);

    if (!seen.stop1 && s.b.cheques[0] === "block") {
      seen.stop1 = true;
      mark("stop1");
      rects.stop1 = await rect(page, `${LANE_B} .cheque`);
    }
    if (!seen.lost && s.a.outcomes.includes("lost")) {
      seen.lost = true;
      mark("lost");
      rects.lostCheque = await rect(page, `${LANE_A} .cheque`);
      rects.lost = await rect(page, `${LANE_A} .outcome`);
      await hold(3600);
      follow = true;
    }
    if (!seen.stop2 && s.b.cheques.length >= 2) {
      if (!follow) {
        await hold(200);
        continue;
      }
      if (s.b.cheques[1] === "block") {
        seen.stop2 = true;
        await page.evaluate((sel) => document.querySelectorAll(sel)[1]?.scrollIntoView({ behavior: "smooth", block: "center" }), `${LANE_B} .cheque`);
        await hold(1100);
        mark("stop2");
        rects.stop2 = await page.evaluate(
          ([sel, w, h]) => {
            const b = document.querySelectorAll(sel as string)[1]?.getBoundingClientRect();
            return b ? { x: b.x / (w as number), y: b.y / (h as number), w: b.width / (w as number), h: b.height / (h as number) } : null;
          },
          [`${LANE_B} .cheque`, VIEW.width, VIEW.height] as const,
        );
        await hold(2600);
      } else if (s.b.cheques[1] === "checking" && !marks.check2) {
        await page.evaluate((sel) => document.querySelectorAll(sel)[1]?.scrollIntoView({ behavior: "smooth", block: "center" }), `${LANE_B} .cheque`);
        await hold(900);
        mark("check2");
      }
    }
    if (seen.stop2 && !seen.signed && s.b.cheques.length >= 3) {
      if (!marks.check3) {
        await page.evaluate((sel) => document.querySelectorAll(sel)[2]?.scrollIntoView({ behavior: "smooth", block: "center" }), `${LANE_B} .cheque`);
        await hold(900);
        mark("check3");
      }
      if (s.b.cheques[2] === "sign") {
        seen.signed = true;
        mark("signed");
        rects.signed = await page.evaluate(
          ([sel, w, h]) => {
            const b = document.querySelectorAll(sel as string)[2]?.getBoundingClientRect();
            return b ? { x: b.x / (w as number), y: b.y / (h as number), w: b.width / (w as number), h: b.height / (h as number) } : null;
          },
          [`${LANE_B} .cheque`, VIEW.width, VIEW.height] as const,
        );
      }
    }
    if (seen.signed && !seen.paid && s.b.outcomes.includes("paid")) {
      seen.paid = true;
      mark("paid");
      await hold(2400);
    }
    if (seen.paid && s.b.done) {
      await page.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ behavior: "smooth", block: "center" }), `${LANE_B} .tally`);
      await hold(1200);
      mark("done");
      rects.tally = await rect(page, `${LANE_B} .tally`);
      await hold(3000);
      break;
    }
    await hold(200);
  }
  if (!marks.done) throw new Error(`the run did not finish: ${JSON.stringify(seen)}`);

  // The measured results.
  await scrollToTop(page, ".proof-figures", 170);
  await hold(1500);
  mark("proof");
  rects.proof = await rect(page, ".proof-figures");
  await hold(4500);
  mark("end");
} finally {
  await cdp.send("Page.stopScreencast").catch(() => {});
  fill(Date.now() / 1000 - clockOffset);
  ffmpeg.stdin.end();
  await new Promise((r) => ffmpeg.on("close", r));
  await browser.close();
}

writeFileSync(
  join(outDir, "site.json"),
  JSON.stringify({ fps: FPS, width: VIEW.width * SCALE, height: VIEW.height * SCALE, seconds: Math.round((written / FPS) * 100) / 100, origin, marks, rects }, null, 2) + "\n",
);
console.log(`\n${(written / FPS).toFixed(1)}s of footage from ${origin}`);
