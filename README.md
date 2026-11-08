# PRAHAR - Factory Flexibility Lab

PRAHAR compares the original factory schedule, independent energy-charge
optimisation, and coordination with a shared supply-line limit. This working
Round 2 prototype is an advisory simulation for the Yuva Yodha Energy Tech
Hackathon. All supplied factories, activities, rates and limits are synthetic.

**Live demo:** https://prahar-orcin.vercel.app/

**Video demonstration:** https://youtu.be/XABd-D15VWw

## Working features

- Editable factory capacities, fixed-load profiles, machine constraints,
  activity power/duration, approved windows and original start times.
- Actual original, independent and coordinated schedule calculations.
- Supervisor refusal: retain an activity's original start and recalculate.
- Load curves, per-factory charges, coincident peak and energy comparisons.
- CSV/JSON import; HTML report, metrics CSV, schedules CSV and complete-run JSON.
- Explicit infeasible and unproven solver outcomes; stale exports are blocked.
- Local browser computation, with no model API key or paid solver service.

The interface uses React and TypeScript, built with Vite. A browser Web Worker
loads the open-source HiGHS 1.15.4 WebAssembly solver. The host serves static
files. There is no application server, database or live equipment connection.
The separate Python/SciPy implementation is a reference check, not the web
app's backend. Uploaded inputs are read locally; no upload endpoint exists.

## Run locally

Use Node.js 22.13 or newer and pnpm 11.25.0:

```text
pnpm install --frozen-lockfile
node scripts/prepare-solver.mjs
pnpm dev
```

Open the address printed by Vite. Build and preview:

```text
pnpm build
pnpm preview --port 5175
```

The build prepares solver assets, checks TypeScript and creates `dist/`.
Generated solver files are deliberately excluded from source control; the
locked dependency supplies the matching JavaScript, WebAssembly and license.

## Hosting

Vercel can build this repository with the included `vercel.json`: framework
Vite, `pnpm run build`, output `dist`, Node.js 24.x. No environment variables,
paid add-ons or purchased domain are required. A personal, non-commercial
competition demo can use Vercel Hobby within its free-plan limits. This is not
a promise of free commercial hosting or unlimited traffic.

The same static output can be served by Cloudflare Pages, Netlify, or static
hosting. Keep `solver-worker.js`, `engine.mjs` and the `solver/` directory with
the page. Serve `.wasm` as `application/wasm`; the supplied `.htaccess` helps on
compatible Apache hosting. Serve through HTTP(S), rather than opening the HTML
directly as a local file.

## Reproduce the default result

Fixed background profiles must exclude activities also entered as jobs. Adding
jobs to an unchanged whole-factory meter profile would count them twice.

| Schedule | Energy charge, INR | Coincident peak, kW | Exceedance intervals | Energy, kWh |
| --- | ---: | ---: | ---: | ---: |
| Original | 12,500 | 200 | 8 | 1,500 |
| Independent | 11,300 | 200 | 8 | 1,500 |
| Coordinated | 11,300 | 140 | 0 | 1,500 |

Each of five factories has 10 kW fixed load and one uninterrupted 30 kW,
two-hour activity. Approved windows are 09:00-21:00; original starts are 18:00.
Sample rates are INR 8/6/10 per kWh for 00:00-09:00 / 09:00-17:00 /
17:00-24:00. The shared limit is 140 kW. Optimisation minimises energy charge,
then total start-slot index at the same charge. Peak is not a separate
objective; equivalent optima may assign different factories to time slots.

Time shifting saves INR 1,200 in this example. Coordination adds feasibility,
with no extra charge saving over independent scheduling. The tighter-supply
preset shows a real trade-off: INR 240 higher charges than independent
scheduling. Flat prices give no charge saving; ample supply adds no coordination
benefit; locked activities retain the original conflict as infeasible.

## Verification

```text
pnpm test:engine
pnpm typecheck
pnpm build
```

The 27 engine/IO tests include six-case Python parity, a small independently
enumerated optimisation case, refusal, infeasibility, resource exclusivity,
energy conservation, input validation, CSV round trips, report escaping and
solver-timeout handling. Reference fixtures are in `tests/python-parity.json`.

The optional browser walkthrough contains 22 check groups. Install Playwright
separately to run `node tests/browser.test.mjs` against a running preview;
`PRAHAR_TEST_URL` sets the URL and `PRAHAR_QA_OUTPUT` sets the output directory.
`PLAYWRIGHT_MODULE_ROOT` and `CHROME_EXECUTABLE` can select existing installations.

The Python reference is in `reference/`; install its `requirements.txt` and run
`python reference/test_scheduler.py`. Its eight tests passed in the original
prototype validation. Python and JavaScript both use HiGHS, so parity is not a
fully independent solver comparison. See `docs/VALIDATION.md` and
`docs/DEMO_GUIDE.md` for coverage and a demonstration sequence.

## Scope and next evidence

This single-day model uses 96 fifteen-minute intervals, at most 10 factories
and 20 activities. It assumes constant activity power, uninterrupted jobs,
deterministic profiles and supervisor-approved windows. It does not model heat
or batch dependencies, uncertain demand, network power flow, voltage or reactive
power. A time-limited solve is not presented as a proven optimum.

Charges exclude monthly demand charges, kVAh/power-factor billing, taxes,
duties and fees. Pure time shifting preserves kWh. Network headroom is not a
payment. No utility reward, carbon certification, cash-pool settlement, machine
control, factory installation or field savings have been implemented or verified.
Imported source labels are declarations, not data verification.

The next field step is to validate one auxiliary activity's real flexibility
with a consenting supervisor, then compare a historical day at the same workload
using the applicable official tariff. Synthetic results are not field evidence.

Third-party software notices are retained; see `THIRD_PARTY_NOTICES.md`.
