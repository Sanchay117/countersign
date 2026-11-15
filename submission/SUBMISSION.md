# Countersign: submission text

Form: https://openserv.typeform.com/submissions02
Deadline: 15 November 2026, 23:59 UTC (Monday 16 November, 05:29 IST)

## Project name

Countersign

## Track

Kite

## Tagline

A second signature on every AI agent payment: it checks what the money is for.

## Links

- Try it, no sign-up: https://countersign-ten-xi.vercel.app
- Code: https://github.com/Sanchay117/countersign
- Video: https://youtu.be/QDLIcxuPGi8
- X post: https://x.com/eepy_engineer/status/2121854462872666612

## Write-up

On 14 November 2026 I gave an AI agent a wallet with a $0.05 per-payment limit and asked it for the cheapest Berlin weather forecast. It paid $0.04 for a forecast that was listed at $0.0015. The merchant raised the price at the paywall, the amount was under the limit, and the payment settled on Kite testnet ([transaction](https://testnet.kitescan.ai/tx/0xc198a5832d50e1d163c99361030b21ccedc1e615ec625eda9792fd58d392e8bf)). A spending limit knows how much. It cannot know what for.

So I built Countersign: a second signature on every payment an agent makes.

1. You give the agent a task in plain words, and a budget.
2. When a merchant asks to be paid, Countersign reads that request against your task: six exact checks in code, then five judgment calls by SERV Reasoning.
3. The wallet signs only if all eleven pass. Otherwise the payment is stopped, or held for you, with the reason in one sentence.

Countersign can only refuse. It never holds money and never signs by itself. If SERV cannot be reached, nothing is signed.

**How it uses SERV Reasoning.** The traps that matter have no wrong number in them: a look-alike merchant name, a listing that tells "AI agents" their owner pre-approved an upgrade, a weekly subscription sold as one purchase. Code cannot judge those. Each payment is one SERV Reasoning request on its cheapest model, with Multipath for a policy that branches, a strict output schema, and the prompt guard, because every request carries text written by sellers. When a listing told the checker itself to ignore its policy, the guard refused it before any model ran. The shopping agent in the demo also runs on SERV.

**Why Kite.** The check sits inside the x402 payment client, after the merchant's demand arrives and before the wallet signs, so it works with any x402 merchant. Countersign is also a paid x402 service on Kite itself: $0.005 a check, charged only when a verdict comes back.

**Proof, measured by me on 14 November 2026.** 54 test payments, with the right answers written first: 40 that should not be signed and 14 that should. Spending limits alone stopped 5 of the 40; the other 35 were under the limits, like the Berlin one. Countersign signed none of the 40: it stopped 35 and held 5 for the owner. It signed 13 of the 14 good ones and held the last one for the owner. A check costs about $0.0006 in SERV tokens and takes about 7 seconds. Any case can be run live on the site, and every run there is a real payment on Kite testnet.

**Revenue.** Whoever runs an agent's wallet pays: an agent platform, a wallet, or a Kite Passport agent. They add one hook to the x402 client their agent already uses (the code is in the README) and pay $0.005 a check over x402, with no account or contract. A check costs under $0.001 in SERV tokens, and a payment that fails an exact check is refused in code at no cost.

**Built during the hackathon:** all of it, 13 to 15 November 2026.

## What to try (60 seconds)

Open https://countersign-ten-xi.vercel.app. The first screen already shows a recorded real run. Press "Send two agents shopping". In about 35 seconds one agent loses $0.04 to a trap, and the other stops two traps and pays the honest merchant. Every payment links to the Kite explorer. Then open "Proof" and run any of the 54 test payments live.

## X posts

See [x-posts.txt](x-posts.txt). Counted the way X counts (links as 23): post 1 is 275 of 280, post 2 is 260 of 280. Attach the video to post 1.
