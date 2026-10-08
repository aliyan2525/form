import { createClient } from "@supabase/supabase-js";
import { validatePayload } from "../lib/validate.js";

const MAX_BODY_BYTES = 10_000;
let client;
const db = () =>
  (client ??= createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  }));

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return res.status(500).json({ error: "not_configured" });
  }
  // Optional: lock the API to your own site, e.g. https://your-survey.vercel.app
  const allowed = process.env.ALLOWED_ORIGIN;
  if (allowed && req.headers.origin && req.headers.origin !== allowed) {
    return res.status(403).json({ error: "forbidden" });
  }
  if (!String(req.headers["content-type"] || "").includes("application/json")) {
    return res.status(415).json({ error: "unsupported_media_type" });
  }
  if (Number(req.headers["content-length"] || 0) > MAX_BODY_BYTES) {
    return res.status(413).json({ error: "payload_too_large" });
  }

  const v = validatePayload(req.body);
  if (!v.ok) return res.status(400).json({ error: v.error });
  const p = v.value;

  const { error } = await db().rpc("save_survey_response", {
    p_session_id: p.sessionId,
    p_answers: p.answers,
    p_step: p.step,
    p_completed: p.completed,
    p_name: p.name,
    p_company: p.company,
    p_contact: p.contact,
    p_score: p.score,
    p_skips: p.skips,
    p_user_agent: String(req.headers["user-agent"] || "").slice(0, 200),
  });
  if (error) {
    console.error("save_survey_response failed:", error.code, error.message);
    return res.status(500).json({ error: "save_failed" });
  }
  return res.status(200).json({ ok: true });
}
