// Worker entrypoint: /api/* surface (Django server/urls.py parity),
// .json format-suffix normalization, cron triggers.

import { makeRouter } from "./routes/helpers";
import account from "./routes/account";
import activity, { statsApp } from "./routes/activity";
import aiModels from "./routes/aimodels";
import auth from "./routes/auth";
import bots from "./routes/bots";
import chats from "./routes/chats";
import decks from "./routes/decks";
import devices from "./routes/devices";
import htmlpages from "./routes/htmlpages";
import profiles from "./routes/profiles";
import revenuecat from "./routes/revenuecat";
import turn from "./routes/turn";
import { media, sendActivityDigests, sendStudyReminders, support } from "./routes/misc";
import type { Env } from "./types";

const app = makeRouter();

// DRF format suffixes: the Expo app calls /chats.json, /bots/<id>.json, ...
// Strip the suffix and force the trailing-slash form the viewsets serve.
function normalizeApiPath(pathname: string): string {
  if (pathname === "/api" || pathname === "/api/") return pathname;
  if (pathname.startsWith("/api/") && pathname.endsWith(".json")) {
    const stripped = pathname.slice(0, -5);
    return stripped.endsWith("/") ? stripped : `${stripped}/`;
  }
  return pathname;
}

// Viewsets first (trailing-slash bases, mirroring urls.py router order),
// then the no-slash turn endpoints that share the /api/chats prefix.
app.route("/api/chats/", chats);
app.route("/api/chats", turn);
app.route("/api/profiles/", profiles);
app.route("/api/bots/", bots);
app.route("/api/ai_models/", aiModels);
app.route("/api/devices/", devices);
app.route("/api/decks/", decks);
app.route("/api/html-pages/", htmlpages);
app.route("/api/activity", activity);
app.route("/api/stats/", statsApp);
app.route("/api", auth);
app.route("/api", account);
app.route("/api/revenuecat", revenuecat);
app.route("/api/support", support);
app.route("/api/media", media);

app.notFound((c) => c.json({ detail: "Not found." }, 404));
app.onError((err, c) => {
  console.error(`unhandled: ${err instanceof Error ? err.message : String(err)}`);
  return c.json({ detail: "Internal server error." }, 500);
});

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const normalized = normalizeApiPath(url.pathname);
    if (normalized !== url.pathname) {
      url.pathname = normalized;
      req = new Request(url.toString(), req);
    }
    return app.fetch(req, env, ctx);
  },

  // Cron: study reminders (midday) + parent digests (nightly). A single
  // `triggers.crons` entry fires both; each handler is idempotent and
  // skips users with no due cards / no activity (Django parity).
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    await sendStudyReminders(env);
    await sendActivityDigests(env);
  },
};
