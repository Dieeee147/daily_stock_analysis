# ChatGPT editorial to HTML email bridge

ChatGPT reads authoritative source material and writes new Chinese summaries and fact-based analysis. This is different from GitHub calling a model API. The scheduled runtime's model is platform-selected; it is not guaranteed to be identical to the model in an interactive chat.

## Payload
Create or update `.github/chatgpt-brief.json` on main after reading and validating all sources. Each write triggers `chatgpt-brief-delivery.yml`. Do not write again after a successful SMTP acceptance merely to retry inbox placement.

The repository is public. Only public-news editorial material belongs in this payload. Never include email addresses, credentials, user identity, personal watchlist groupings, portfolios, holdings or private instructions. The runner loads the private watchlist and email configuration from existing variables/secrets. Personalized generated reports are not uploaded as public artifacts.

JSON schema:
```json
{
  "version": 1,
  "date": "YYYY-MM-DD",
  "researchedAt": "current ISO UTC timestamp",
  "news": [{
    "title": "中文完整标题",
    "stance": "中性",
    "sourceLabel": "媒体、机构及已核实作者；注明媒体转述",
    "published_date": "verified ISO timestamp or YYYY-MM-DD",
    "url": "https://original-source.example/article",
    "summary": "自己的中文事实摘要，保留关键数字与口径",
    "analysis": "解释事实差异、适用条件、审批状态及核实边界；禁止预测涨跌",
    "extraSources": [{"label": "补充原文", "url": "https://original-source.example/other"}]
  }],
  "analysts": []
}
```
Use 1–10 deduplicated news (target 10, never fabricate to fill) and 0–5 institutional views with the same article fields. Mark forecasts and publication dates; public interviews/commentary must not be described as full proprietary research. Source domains must pass the allowlist in `scripts/chatgpt_brief.mjs`. All fields are escaped by the existing HTML renderer. Do not add arbitrary raw HTML.

Draft date must equal current Asia/Shanghai date; researchedAt must be at most 24 hours old. Stale drafts stop before email is sent. Need source-body reading, not search-snippet-only summaries. Observe copyright limits. Use verified day-only dates rather than inventing precise publication times.

## Sending and verification
1. Publish only the validated editorial JSON.
2. Fetch Actions runs for the resulting commit SHA and inspect the ChatGPT delivery workflow.
3. Confirm its generate step and send step succeed; inspect safe logs for `CHATGPT_BRIEF_QUALITY` and `SMTP_ACCEPTED`.
4. SMTP acceptance does not prove inbox arrival. Report actual source gaps.
5. If a run fails, inspect before retry; never claim delivery succeeded based solely on a queued run.

The runner reuses existing market/watchlist collectors, HTML design and SMTP configuration. News and institutional views are ChatGPT-authored; watchlist quotes and additional announcement leads remain script-collected and are explicitly labeled. An absent company link does not justify invented company-level analysis.

## Current experiment boundary
This bridge is additive. The existing 08:00 no-model schedule is retained until the cloud ChatGPT task and email path have been tested. An interactive run alone does not validate unattended scheduling. Existing model API settings are retained for restoration.
