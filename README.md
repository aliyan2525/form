# Startup research survey

A mobile-first, one-question-at-a-time survey (with the Rungo mascot) that saves every answer to Supabase as people go, so you can see exactly where they drop off.

```
Browser (public/index.html)  ->  POST /api/save (Vercel function)  ->  Supabase Postgres
                                  validates + sanitises input         RLS on, no public access
```

* The browser never talks to the database directly. The Vercel function holds the secret key and writes through one locked-down SQL function.
* One row per respondent, updated as they progress. Partial responses are kept.
* Progress also autosaves in the respondent's browser, so they can resume after closing the tab.

## 1. Set up the database (Supabase)

Use a **new, separate** Supabase project (don't mix this into another product's database).

1. Supabase dashboard -> **SQL Editor** -> paste the contents of `supabase/migrations/20261008000000_survey_responses.sql` -> **Run**.
2. Go to **Project Settings -> API** and copy the **Project URL** and the **service_role** key. The service_role key is a secret: it goes only in Vercel env vars, never in the browser or in git.

(Requires Postgres 15+ for `security_invoker` views, which every current Supabase project has.)

## 2. Run it locally (optional)

```bash
npm install
cp .env.example .env      # fill in the two values
npx vercel dev            # http://localhost:3000
npm test                  # 19 tests: validation + API guards
```

## 3. Push to GitHub

```bash
git init && git add . && git commit -m "Startup research survey"
git branch -M main
git remote add origin https://github.com/YOUR-USER/startup-survey.git
git push -u origin main
```

## 4. Deploy on Vercel

1. Vercel -> **Add New -> Project** -> import the repo. Framework preset: **Other** (leave build settings empty).
2. **Environment Variables**: add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (optional: `ALLOWED_ORIGIN` = your final site URL, e.g. `https://your-survey.vercel.app`).
3. **Deploy**. Open the URL, answer the survey, then check the table in Supabase.

Every `git push` to `main` redeploys automatically.

## 5. Read your responses

In Supabase **Table Editor** (export CSV from there), or in the SQL editor:

```sql
select * from survey_answers_flat;             -- every response, one column per question
select * from survey_funnel;                   -- how many people reached each step (find the drop-off)
select count(*) filter (where completed) as finished, count(*) as started from survey_responses;
select price, count(*) from survey_answers_flat where completed group by price order by count(*) desc;
```

Steps: 0-7 are the eight questions, 8 is the contact screen, 9 is finished.

## 6. Customise

* Your name, questions, answer options, mascot lines and price ranges are all near the top of the `<script>` in `public/index.html`.
* If you rename a question's `k` (its short key), also update `QUESTION_KEYS` in `lib/validate.js` and the two views in the migration.

## 7. Security and privacy notes

* RLS is on with no policies and no grants to `anon`/`authenticated`: the public API key cannot read or write anything. Only the server can.
* The function validates every field (allow-listed answer keys, length caps, no control characters) and rejects anything malformed.
* `ALLOWED_ORIGIN` only stops other websites' browsers from posting to your API. It does not stop someone scripting requests. For real abuse protection, add a **rate-limit rule** in Vercel -> Firewall for `/api/save`.
* You are storing names and contact details. The page tells respondents their answers are stored securely and used only for this research; keep to that. To delete someone on request: `delete from survey_responses where contact = '...';`
* Rotate the service_role key in Supabase if it is ever exposed.

## 8. Known limits

* Anonymous: a respondent clearing their browser data and returning starts a new response.
* Per-IP spam control is left to Vercel's firewall, as above.
