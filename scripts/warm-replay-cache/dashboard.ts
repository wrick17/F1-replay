import type { WarmStatus } from "./types";

export const startDashboard = (status: WarmStatus, port: number) => {
  Bun.serve({
    port,
    fetch: (request) => {
      const url = new URL(request.url);
      if (url.pathname === "/status") {
        return new Response(JSON.stringify(status, null, 2), {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store, max-age=0",
            Pragma: "no-cache",
          },
        });
      }
      const snapshot = JSON.stringify(status).replace(/</g, "\\u003c");
      const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Replay Cache Warmer</title>
    <style>
      :root { color-scheme: light; }
      body { margin: 0; font-family: "IBM Plex Sans", "Segoe UI", system-ui, sans-serif; background: #f2f2ed; color: #1c1c1c; }
      header { padding: 24px 32px; background: #1c1c1c; color: #f8f8f2; }
      h1 { margin: 0; font-size: 22px; letter-spacing: 0.03em; }
      main { padding: 24px 32px 40px; display: grid; gap: 20px; max-width: 980px; }
      .card { background: #ffffff; border-radius: 14px; padding: 18px 20px; box-shadow: 0 10px 24px rgba(0,0,0,0.08); }
      .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
      .metric { background: #f8f8f2; border-radius: 12px; padding: 12px 14px; }
      .metric span { display: block; font-size: 12px; color: #595959; text-transform: uppercase; letter-spacing: 0.06em; }
      .metric strong { font-size: 22px; }
      .bar { height: 10px; border-radius: 999px; background: #e2e2d8; overflow: hidden; }
      .bar > div { height: 100%; background: linear-gradient(90deg, #f4b400, #ea4335); width: 0%; transition: width 0.4s ease; }
      ul { margin: 8px 0 0; padding-left: 18px; color: #5a5a5a; }
      .muted { color: #5a5a5a; font-size: 13px; }
      pre { margin: 8px 0 0; background: #121212; color: #e8e8e8; padding: 12px; border-radius: 10px; font-size: 12px; line-height: 1.5; max-height: 320px; overflow: auto; }
    </style>
  </head>
  <body>
    <header><h1>Replay Cache Warmer</h1></header>
    <main>
      <section class="card">
        <div class="metrics">
          <div class="metric"><span>Total Sessions</span><strong id="total">0</strong></div>
          <div class="metric"><span>Warmed</span><strong id="warmed">0</strong></div>
          <div class="metric"><span>Cache Hits</span><strong id="skipped">0</strong></div>
          <div class="metric"><span>Failed</span><strong id="failed">0</strong></div>
        </div>
        <div style="margin-top:16px;" class="bar"><div id="progress"></div></div>
        <p class="muted" id="current">Waiting for data...</p>
        <p class="muted" id="updated"></p>
        <p class="muted" id="statusError"></p>
      </section>
      <section class="card">
        <strong>Recent failures</strong>
        <ul id="failures"><li>None</li></ul>
      </section>
      <section class="card">
        <strong>Recent logs</strong>
        <pre id="logs">No logs yet.</pre>
      </section>
    </main>
    <script>
      window.__STATUS__ = ${snapshot};
      const render = (data) => {
        const done = data.warmed + data.skipped + data.failed;
        const total = data.totalSessions || 0;
        const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
        document.getElementById('total').textContent = total;
        document.getElementById('warmed').textContent = data.warmed;
        document.getElementById('skipped').textContent = data.skipped;
        document.getElementById('failed').textContent = data.failed;
        document.getElementById('progress').style.width = pct + '%';
        document.getElementById('current').textContent = data.current || 'Idle';
        document.getElementById('updated').textContent = 'Updated: ' + data.updatedAt;
        const list = document.getElementById('failures');
        list.innerHTML = '';
        if (!data.recentFailures.length) {
          const li = document.createElement('li');
          li.textContent = 'None';
          list.appendChild(li);
        } else {
          data.recentFailures.forEach((entry) => {
            const li = document.createElement('li');
            li.textContent = entry;
            list.appendChild(li);
          });
        }
        const logEl = document.getElementById('logs');
        if (!data.recentLogs.length) {
          logEl.textContent = 'No logs yet.';
        } else {
          logEl.textContent = data.recentLogs.join('\n');
        }
      };
      const update = async () => {
        const statusEl = document.getElementById('statusError');
        statusEl.textContent = '';
        let res;
        try {
          res = await fetch('/status?ts=' + Date.now(), { cache: 'no-store' });
        } catch (err) {
          statusEl.textContent = 'Status fetch failed.';
          render(window.__STATUS__);
          return;
        }
        if (!res.ok) {
          statusEl.textContent = 'Status fetch failed: ' + res.status;
          render(window.__STATUS__);
          return;
        }
        const data = await res.json();
        window.__STATUS__ = data;
        render(data);
      };
      render(window.__STATUS__);
      update();
      setInterval(update, 2000);
    </script>
  </body>
</html>`;
      return new Response(html, {
        headers: {
          "Content-Type": "text/html",
          "Cache-Control": "no-store, max-age=0",
          Pragma: "no-cache",
        },
      });
    },
  });

  return `http://localhost:${port}`;
};
