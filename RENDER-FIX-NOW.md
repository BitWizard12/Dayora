# Fix Render now

1. Open Render → **dayora-api** → **Environment**.
2. Under **Linked Environment Groups**, select **Dayora Production** and click **Link**. Verify it appears linked to **dayora-api**. A group existing in the workspace is not enough.
3. Open the linked group and verify:
   - **FIREBASE_PROJECT_ID** = `dayora-5a3ad` (non-empty).
   - **FIREBASE_WEB_API_KEY** = this project's Firebase web API key (non-empty).
   - **FIREBASE_SERVICE_ACCOUNT_JSON** exists, is non-empty, and its `project_id` is `dayora-5a3ad`.
   - **SMTP_URL** and **MAIL_FROM** retain their working production values.
4. Return to **dayora-api → Environment**. Remove blank/stale service-level duplicates of these keys, or correct them. Service-level variables override group values, including blank values. Avoid duplicate keys across linked groups.
5. Verify production settings: **NODE_ENV=production**, **NODE_VERSION=22.20.0**, **APP_ORIGIN=https://dayora-five.vercel.app**, **TRUST_PROXY=1**, **COOKIE_SAME_SITE=none**, **RATE_LIMIT_STORE=firestore**, **MAIL_MODE=smtp**.
6. Click **Save only** for edits; then **Manual Deploy → Deploy latest commit**. Verify the deploy uses the current main tip (`c363082319fb76a29c5117be29d829c115dce5d8` if no newer commit was pushed).

Inspect credential values only in Render. Never copy them into Git, Vercel or chat.
