import type { WarmStatus } from "./types";

const escapeJsonForInlineScript = (value: unknown) => {
  // Avoid breaking out of <script> via `</script>` or `<` sequences.
  return JSON.stringify(value).replace(/</g, "\\u003c");
};

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

      const snapshot = escapeJsonForInlineScript(status);
      const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Cache Warmer Dashboard</title>
    <style>
      :root { color-scheme: light; }
      body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, sans-serif; background: #f4f5f7; color: #121212; }
      header { padding: 18px 22px; background: #0f172a; color: #e2e8f0; display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; }
      header h1 { margin: 0; font-size: 16px; letter-spacing: 0.04em; text-transform: uppercase; }
      header .meta { font-size: 12px; color: #94a3b8; }
      main { padding: 16px 18px 26px; display: grid; gap: 14px; }
      .card { background: #ffffff; border-radius: 12px; padding: 14px 14px; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); border: 1px solid rgba(15, 23, 42, 0.08); }
      .row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .muted { color: #64748b; font-size: 12px; }
      .error { color: #b91c1c; font-size: 12px; }
      .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; }
      .kpi { background: #f8fafc; border-radius: 10px; padding: 10px 12px; border: 1px solid rgba(15, 23, 42, 0.06); }
      .kpi .label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.06em; }
      .kpi .value { font-size: 20px; font-weight: 700; margin-top: 2px; color: #0f172a; }
      .bar { height: 10px; border-radius: 999px; background: #e2e8f0; overflow: hidden; border: 1px solid rgba(15, 23, 42, 0.08); }
      .bar > div { height: 100%; width: 0%; background: linear-gradient(90deg, #2563eb, #22c55e, #f59e0b, #ef4444); transition: width 0.3s ease; }
      .controls { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
      input[type="search"] { padding: 8px 10px; border-radius: 10px; border: 1px solid rgba(15, 23, 42, 0.18); min-width: 260px; outline: none; }
      select { padding: 8px 10px; border-radius: 10px; border: 1px solid rgba(15, 23, 42, 0.18); outline: none; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { padding: 8px 8px; border-bottom: 1px solid rgba(15, 23, 42, 0.08); vertical-align: top; }
      th { text-align: left; font-size: 11px; color: #475569; text-transform: uppercase; letter-spacing: 0.06em; position: sticky; top: 0; background: #ffffff; z-index: 1; }
      tr:hover td { background: #f8fafc; }
      .pill { display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; padding: 4px 8px; border: 1px solid rgba(15, 23, 42, 0.16); background: #ffffff; }
      .dot { width: 8px; height: 8px; border-radius: 999px; background: #94a3b8; }
      .phase-pending .dot { background: #94a3b8; }
      .phase-in_progress .dot { background: #2563eb; }
      .phase-hit .dot { background: #16a34a; }
      .phase-warmed .dot { background: #0ea5e9; }
      .phase-failed .dot { background: #dc2626; }
      .small { font-size: 11px; color: #64748b; }
      code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 11px; }
      details { margin-top: 8px; }
      details summary { cursor: pointer; user-select: none; font-weight: 700; color: #0f172a; }
      pre { margin: 10px 0 0; background: #0b1220; color: #e5e7eb; padding: 12px; border-radius: 10px; font-size: 11px; line-height: 1.45; max-height: 320px; overflow: auto; border: 1px solid rgba(148, 163, 184, 0.18); }
    </style>
  </head>
  <body>
    <header>
      <h1>Cache Warmer Dashboard</h1>
      <div class="meta" id="meta"></div>
    </header>
    <main>
      <section class="card">
        <div class="kpis">
          <div class="kpi"><div class="label">Sessions Discovered</div><div class="value" id="kpiDiscovered">0</div></div>
          <div class="kpi"><div class="label">Replay Done</div><div class="value" id="kpiReplayDone">0</div></div>
          <div class="kpi"><div class="label">Car Telemetry Done</div><div class="value" id="kpiCarDone">0</div></div>
          <div class="kpi"><div class="label">Failures</div><div class="value" id="kpiFailures">0</div></div>
        </div>
        <div style="margin-top:12px;" class="bar"><div id="progress"></div></div>
        <div class="row" style="margin-top:10px;">
          <div class="muted" id="current">Idle</div>
          <div class="muted" id="updated"></div>
          <div class="error" id="statusError"></div>
        </div>
        <div class="controls" style="margin-top:10px;">
          <input id="search" type="search" placeholder="Filter by meeting, circuit, session type, session_key..." />
          <select id="filterReplay">
            <option value="">Replay: all</option>
            <option value="pending">Replay: pending</option>
            <option value="in_progress">Replay: in_progress</option>
            <option value="hit">Replay: hit</option>
            <option value="warmed">Replay: warmed</option>
            <option value="failed">Replay: failed</option>
          </select>
          <select id="filterCar">
            <option value="">Telemetry: all</option>
            <option value="pending">Telemetry: pending</option>
            <option value="in_progress">Telemetry: in_progress</option>
            <option value="hit">Telemetry: hit</option>
            <option value="warmed">Telemetry: warmed</option>
            <option value="failed">Telemetry: failed</option>
          </select>
        </div>
      </section>

      <section class="card">
        <div class="row" style="justify-content: space-between;">
          <div><strong>Sessions</strong> <span class="muted" id="rowsMeta"></span></div>
        </div>
        <div style="overflow:auto; max-height: 62vh; border-radius: 10px; border: 1px solid rgba(15, 23, 42, 0.10); margin-top: 10px;">
          <table>
            <thead>
              <tr>
                <th>Year</th>
                <th>Round</th>
                <th>Meeting</th>
                <th>Circuit</th>
                <th>Session</th>
                <th>session_key</th>
                <th>Replay</th>
                <th>Telemetry</th>
                <th>Updated</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody id="rows"></tbody>
          </table>
        </div>
      </section>

      <section class="card">
        <strong>Failures</strong>
        <div class="muted small" style="margin-top:6px;">Most recent first.</div>
        <pre id="failures">None</pre>
      </section>

      <section class="card">
        <details open>
          <summary>Logs</summary>
          <div class="muted small" style="margin-top:6px;">Most recent first. This list is truncated.</div>
          <pre id="logs">No logs yet.</pre>
        </details>
      </section>
    </main>

    <script>
      window.__STATUS__ = ${snapshot};

      const formatIso = (iso) => {
        if (!iso) return '';
        try { return new Date(iso).toLocaleString(); } catch { return iso; }
      };

      const phaseLabel = (phase) => phase === 'in_progress' ? 'in-progress' : phase;

      const makePill = (task) => {
        const phase = task?.phase || 'pending';
        const xCache = task?.xCache ? String(task.xCache) : '';
        const dur = typeof task?.durationMs === 'number' ? (task.durationMs + 'ms') : '';
        const extra = [xCache && ('x-cache ' + xCache), dur].filter(Boolean).join(' · ');
        const extraHtml = extra ? '<div class="small">' + extra + '</div>' : '';
        return '<span class="pill phase-' + phase + '"><span class="dot"></span><span>' + phaseLabel(phase) + '</span></span>' + extraHtml;
      };

      const countDone = (sessions, field) => {
        let done = 0;
        for (const s of sessions) {
          const ph = s[field]?.phase;
          if (ph === 'hit' || ph === 'warmed' || ph === 'failed') done += 1;
        }
        return done;
      };

      const applyFilters = (data) => {
        const q = (document.getElementById('search').value || '').toLowerCase().trim();
        const fr = document.getElementById('filterReplay').value;
        const fc = document.getElementById('filterCar').value;

        const filtered = (data.sessions || []).filter((s) => {
          if (fr && s.replay?.phase !== fr) return false;
          if (fc && s.carTelemetry?.phase !== fc) return false;
          if (!q) return true;
          const hay = [
            s.meetingName,
            s.countryName,
            s.circuitShortName,
            s.sessionType,
            s.sessionName,
            String(s.sessionKey),
          ].join(' ').toLowerCase();
          return hay.includes(q);
        });

        const sessionTypeRank = (sessionType) => {
          if (sessionType === 'Qualifying') return 0;
          if (sessionType === 'Sprint') return 1;
          if (sessionType === 'Race') return 2;
          return 99;
        };

        // Table order:
        // - year desc (2025 first)
        // - round asc (R1, R2, ...)
        // - session type (Qualifying, Sprint, Race)
        return filtered.slice().sort((a, b) => {
          if (a.year !== b.year) return b.year - a.year;
          if (a.round !== b.round) return a.round - b.round;
          const ar = sessionTypeRank(a.sessionType);
          const br = sessionTypeRank(b.sessionType);
          if (ar !== br) return ar - br;
          return a.sessionKey - b.sessionKey;
        });
      };

      const render = (data) => {
        const discovered = data.sessionsDiscovered || 0;
        document.getElementById('kpiDiscovered').textContent = discovered;
        const replayDone = countDone(data.sessions || [], 'replay');
        const carDone = countDone(data.sessions || [], 'carTelemetry');
        document.getElementById('kpiReplayDone').textContent = replayDone + ' / ' + discovered;
        document.getElementById('kpiCarDone').textContent = carDone + ' / ' + discovered;
        document.getElementById('kpiFailures').textContent = (data.recentFailures || []).length;

        const done = Math.min(replayDone, carDone);
        const pct = discovered > 0 ? Math.round((done / discovered) * 100) : 0;
        document.getElementById('progress').style.width = Math.min(100, Math.max(0, pct)) + '%';

        document.getElementById('current').textContent = data.current || 'Idle';
        document.getElementById('updated').textContent = 'Updated: ' + (data.updatedAt ? formatIso(data.updatedAt) : '');
        document.getElementById('meta').textContent = 'Started: ' + (data.startedAt ? formatIso(data.startedAt) : '') + ' · Sessions: ' + discovered;

        const filtered = applyFilters(data);
        document.getElementById('rowsMeta').textContent = '(' + filtered.length + ' shown)';

        const tbody = document.getElementById('rows');
        tbody.innerHTML = '';
        for (const s of filtered) {
          const err = (s.replay?.error || s.carTelemetry?.error || '');
          const tr = document.createElement('tr');
          tr.innerHTML = '' +
            '<td>' + s.year + '</td>' +
            '<td>' + s.round + '</td>' +
            '<td><div><strong>' + (s.meetingName || '') + '</strong></div><div class="small">' + (s.countryName || '') + '</div></td>' +
            '<td><div><strong>' + (s.circuitShortName || '') + '</strong></div><div class="small">' + (s.sessionType || '') + '</div></td>' +
            '<td><div><strong>' + (s.sessionName || s.sessionType || '') + '</strong></div><div class="small">' + (s.dateStart ? formatIso(s.dateStart) : '') + ' to ' + (s.dateEnd ? formatIso(s.dateEnd) : '') + '</div></td>' +
            '<td><code>' + s.sessionKey + '</code></td>' +
            '<td>' + makePill(s.replay) + '</td>' +
            '<td>' + makePill(s.carTelemetry) + '</td>' +
            '<td class="small">' + (s.updatedAt ? formatIso(s.updatedAt) : '') + '</td>' +
            '<td class="small" style="max-width: 420px; white-space: pre-wrap;">' + (err || '') + '</td>';
          tbody.appendChild(tr);
        }

        const failures = data.recentFailures || [];
        document.getElementById('failures').textContent = failures.length ? failures.join('\\n') : 'None';

        const logs = data.recentLogs || [];
        document.getElementById('logs').textContent = logs.length ? logs.join('\\n') : 'No logs yet.';
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

      document.getElementById('search').addEventListener('input', () => render(window.__STATUS__));
      document.getElementById('filterReplay').addEventListener('change', () => render(window.__STATUS__));
      document.getElementById('filterCar').addEventListener('change', () => render(window.__STATUS__));

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
