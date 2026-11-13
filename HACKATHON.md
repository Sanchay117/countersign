# SERV Hackathon, Edition 02 (OpenServ)

Page: https://www.openserv.ai/hackathon-2

## Key dates
- Build period: Nov 2 to 15, 2026 (online)
- Submissions close: **Nov 15, 2026, 23:59 UTC** (Mon Nov 16, 05:29 IST)
- Winners: TBA, announced on X (@openservai) and the hackathon page

## What to build
Every entry must use **SERV Reasoning**. Pick one track:
1. **Dolphin**: agents on decentralized open-source models (https://dphn.ai/docs/coupon-credits/)
2. **Kite**: agents with verifiable identity and user-set spending limits that shop, book and pay (https://docs.gokite.ai/passport)
3. **Reppo**: reliable agents that turn real-time feedback into measurable improvement (https://docs.reppo.ai/concepts/evaluation-api)
4. **Open**: any idea built on SERV Reasoning

## Submission (https://openserv.typeform.com/submissions02)
- Public code repo
- Demo link or video
- Short write-up: what it does, how it uses SERV Reasoning, which track
- An X post about it, linked in the form

## Judging
Creativity, user readiness, revenue potential. $5,000 pool: 2 track winners, best overall build, special mention (amounts TBA).

## SERV Reasoning API
- Base URL: `https://inference-api.openserv.ai`
- OpenAI SDK: `baseURL: "https://inference-api.openserv.ai/v1"`, `apiKey: SERV_API_KEY`
- Anthropic SDK: `baseURL: "https://inference-api.openserv.ai"` (no `/v1`), `authToken: SERV_API_KEY`
- Endpoints: `/v1/chat/completions`, `/v1/responses`, `/v1/messages`
- A system prompt is required on every request (400 otherwise)
- Key: https://console.openserv.ai (Settings > API Keys). Docs: https://docs.openserv.ai
- Models and prices: https://docs.openserv.ai/serv-reasoning/models

## Help
- Discord (developer questions): https://discord.com/invite/9u724WsWCU
- Telegram: https://t.me/openservai
