# Solar scheduling study - 13 November 2026

This Python study accompanies the working PRAHAR browser app. The browser app
still models grid electricity only. This study adds existing onsite solar to a
separate scheduling model. It uses fictional inputs and makes no field claim.

## The question

Can moving the same work use more existing solar power and reduce purchased
electricity CO2 per assumed batch? Does coordination add anything beyond each
factory planning its own work?

## Inputs and the comparison

We reuse the five factories, activities, prices and 140 kW shared limit from
the main example. Each factory has a 10 kW background load. It completes one
30 kW activity for two uninterrupted hours within 09:00-21:00. The original
start is 18:00. Each activity represents one equal assumed batch. All plans
complete five such batches. Total gross energy stays at 1,500 kWh per day.

We add these **simulation assumptions**:

- Each factory already owns PV with 35 kW available from 10:00 to 14:00.
  Availability is zero outside that window. This simple rectangular profile
  is a test input. It is not measured generation or a weather forecast.
- Total available PV is 700 kWh. Each factory uses only its own PV.
- The site cannot export. It curtails unused PV. There is no battery.
- The owner keeps the solar attributes. We assume no sale of certificates.
- PV availability stays identical in the original, independent and shared plans.
  Both optimised plans account for their own PV. Independent planning has full
  access to the same solar information and local operating limits.
- The shared constraint limits the sum of positive factory grid imports.
  The shared plan also reserves enough capacity if all PV disappears.
  It therefore checks gross declared load against the same shared limit.
  Factory equipment limits still apply to gross load. We do not model power
  flow, voltage or protection. An electrical reviewer must verify the boundary.

No new PV purchase is part of this example or the current prototype cost.
These results apply to a site with otherwise curtailed existing solar and
safe activity flexibility. They do not show that such a site has been found.

## Calculated result

| Metric | Original | Independent, solar aware | Coordinated, solar aware |
| --- | ---: | ---: | ---: |
| Gross energy, kWh/day | 1,500 | 1,500 | 1,500 |
| Available PV, kWh/day | 700 | 700 | 700 |
| PV used onsite, kWh/day | 200 | 450 | 450 |
| PV curtailed, kWh/day | 500 | 250 | 250 |
| Grid imports, kWh/day | 1,300 | 1,050 | 1,050 |
| Assumed equal batches/day | 5 | 5 | 5 |
| Gross energy, kWh/assumed batch | 300 | 300 | 300 |
| Purchased-electricity CO2, kg/day | 923.0 | 745.5 | 745.5 |
| Purchased-electricity CO2, kg/assumed batch | 184.6 | 149.1 | 149.1 |

Moving work uses 250 kWh more PV. Grid imports fall by 250 kWh, or 19.23%.
Purchased-electricity CO2 falls by 177.5 kg/day, or 35.5 kg/assumed batch.
The intensity falls by **19.23% against the original plan with the same PV**.
Gross specific energy use does not change.

**Coordination adds zero CO2 benefit over solar-aware independent planning in
this case.** With the assumed PV, both solar plans fit the shared limit.
If PV drops to zero, the independent plan reaches 200 kW and exceeds the
limit for eight intervals. The revised shared plan reaches 140 kW and has
zero exceedances. It retains the same forecast PV use and energy charge.
This reserve protects only the declared activity and background profiles.
The separate grid-only example also shows where coordination removes exceedances.
We do not add the percentages from the two examples or claim both results
occur at a real site.

## Factor and accounting scope

We use the CEA version 21.0 weighted average for FY 2024-25:
**0.710 tCO2/MWh = 0.710 kgCO2/kWh**. Table S includes renewable generation
and captive injections and adjusts cross-border transfers. We use this dated
annual reference consistently. We do not claim it is a live hourly factor or
the latest release.

[CEA, CO2 Baseline Database, version 21.0, November 2025, Table S, report page 1](https://cea.nic.in/api/cdm-report-version/view-pdf/hi/78).

For each plan:

```text
factory grid import = max(gross factory load - own available PV, 0)
PV used = min(gross factory load, own available PV)
daily imported kWh = sum(factory grid import x 0.25 hours)
purchased-electricity CO2 = imported kWh x 0.710 kgCO2/kWh
CO2 per assumed batch = purchased-electricity CO2 / 5 assumed equal batches
```

This is an annual-average purchased-electricity inventory illustration. It
excludes process fuels, other greenhouse gases, PV lifecycle emissions and
all other sources. It does not calculate whole-factory emissions intensity,
marginal grid emissions, carbon credits or a certified footprint. The assumed
batch count normalises the example. We have not measured output or quality.

The owner-retained solar assumption matters for accounting. See
[GHG Protocol Scope 2 Guidance, section 7.1 and Table 6.1](https://ghgprotocol.org/sites/default/files/2023-03/Scope%202%20Guidance.pdf).
If the owner sells solar attributes or the baseline exports surplus power,
this illustration cannot establish the same avoided system emissions. A
site study must reconcile exports, attributes and the chosen accounting method.

## Controls and verification

Nine new automated checks passed on 13 November 2026. They check energy
balances, unchanged workload, the expected calculation, independent factory
solutions, infeasible limits, locked starts, input errors and a small case
against exhaustive enumeration. SciPy uses HiGHS. Enumeration provides a
separate check of the small model, not a physical validation.

- **No PV:** all plans import 1,500 kWh. CO2 improvement is zero.
- **PV already fully used:** each factory has only 5 kW during 10:00-14:00.
  Background demand uses it all. Every plan imports 1,400 kWh. Improvement is zero.
- **Locked activities:** we hold the original starts and use a slack 220 kW
  limit to isolate the carbon comparison. Imports stay at 1,300 kWh.
- **Locked activities at 140 kW:** the shared plan is infeasible. It receives
  no invented energy or carbon result.
- **PV forecast fails:** the first version placed all five activities at
  10:00. Complete PV loss then caused eight exceedance intervals. We fixed
  this with the full-loss reserve. Actual PV at 0%, 25%, 50%, 80% and 100%
  of the assumed profile leaves zero shared-limit exceedances for the
  revised shared schedule. Forecast errors still change costs and CO2.

Run from the repository root after installing `reference/requirements.txt`:

```text
python reference/test_solar_scheduler.py
python reference/solar_scheduler.py
```

The second command writes complete inputs and results to
`docs/solar-study/solar-study.json`. It also writes a compact summary and
15-minute factory balances as CSV files. The optimisation minimises energy
charges, then start times at the same charge. It does not directly minimise
emissions. In this example, the objectives align because solar displaces
positive-price grid imports within the same cheap-price window.

## Next evidence

We need a consenting site with safe flexible work and measured curtailed PV.
We must check production quality, completion rates, exports and solar
attributes. We would replay at least 14 days and compare manual staggering,
solar-aware factory planning and coordination. Weather uncertainty and
missing data need conservative operating rules before a field trial.
