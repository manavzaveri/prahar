# Validation record - 8 November 2026

## Companion solar study - 13 November 2026

The separate Python solar model passed nine new tests. These check gross
energy and PV balances, unchanged assumed output, the expected emissions
calculation, independent factory solutions, zero-benefit controls, locked
starts, full PV loss, infeasible limits, invalid inputs and a small case against
exhaustive enumeration. See `SOLAR_STUDY.md` for assumptions and the CEA factor.
The grid-only engine also passed 28 tests after a repair for activity IDs such
as `__proto__`. Its eight Python reference tests passed again. An additional
audit checked 60 seeded scenarios against separate exhaustive calculations:
58 feasible and 62 infeasible mode-solves matched. Seven other audit groups
also passed. The supported 10-factory, 20-activity case solved optimally in
about two seconds on this machine. This single case is not a general speed
guarantee. See `stress-test/engine-audit.json` and `STRESS_TEST_REVIEW.md`.
The live browser app stays grid-only. The earlier 22-group browser record
below describes the original core, not the new solar study or a new release.

## Portable release checks

- 27 JavaScript calculation/input-output tests passed after migration.
- TypeScript passed and Vite produced the complete static production build.
- 22 browser check groups passed against that production build at desktop
  1440x1100, phone 390x844 and tablet 820x1180 sizes.
- No uncaught page errors or failed asset requests occurred in that walkthrough.
- Desktop and phone screenshots were visually inspected.
- The same 22 groups also passed against the public Vercel deployment in an
  isolated, signed-out browser. The solver WASM returned HTTP 200 with the
  `application/wasm` content type. No page or resource errors were recorded.

The migration replaces the original hosting/framework wrapper with React +
Vite static hosting. The authored scheduling engine, worker protocol, input
assumptions, controls and results are retained. Generated solver and license
assets are prepared from the pinned dependencies at build time.

## Coverage

The engine suite covers six reference-fixture scenarios; a small independently
enumerated objective; energy conservation; refusal; infeasible and empty cases;
machine exclusivity; malformed data; CSV round trips and formula neutralisation;
HTML escaping; and solver-status handling. The two languages both use HiGHS,
so parity is not an independent solver comparison. Eight Python reference
tests passed in the original 7 November validation; their model is unchanged.

The browser walkthrough verifies the default numeric result, all four exports,
operator refusal, tight/flat/locked/ample examples, changed-input export blocking,
passport edits, CSV and JSON imports, errors, evidence labels, and layout overflow.
The malformed-JSON check waits for the asynchronous file-read error to appear
before asserting it. The interface itself did not require a change for this.

`browser-checks.json` records the local production walkthrough;
`hosted-browser-checks.json` records the public Vercel walkthrough. Run
`pnpm test:engine`, `pnpm typecheck` and `pnpm build` from the repository root.
See the root README for the optional browser and Python reference checks.

## Evidence limits

These checks establish internal software consistency under declared synthetic
inputs. They do not establish physical process flexibility, an official tariff,
monthly-bill savings, factory acceptance, live integration or field performance.
No factory or utility pilot exists. No accessibility, security or cross-browser
certification is claimed.
