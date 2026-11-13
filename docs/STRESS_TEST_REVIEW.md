# PRAHAR stress-test review - 13 November 2026

PRAHAR works as a small scheduling simulator. The calculations do not yet
establish a business or a safe factory deployment. We would continue the
competition entry with this narrow claim. We would not fund a cluster rollout
until a site beats the manual alternative at matched output and quality.

## What we found and changed

**Manual planning matches the default result.** Start three activities at
09:00 and two at 11:00. This simple plan gives INR 11,300, a 140 kW peak and
zero exceedance intervals. It matches PRAHAR. The default example proves a
calculation, not willingness to pay. A pilot must test more varied days,
changing constraints and the operator's actual effort. If a spreadsheet or
manual rota works as well after costs, we should stop the paid cluster offer.

**The first solar model relied too much on its forecast.** It put all five
activities at 10:00. If PV disappeared, imports reached 200 kW for eight
intervals, above the 140 kW limit. We added a conservative constraint that
reserves enough capacity for complete PV loss. The revised shared schedule
stays at or below 140 kW for the declared loads. It keeps the same forecast
PV use and CO2 result. This does not protect against undeclared demand,
equipment transients, wrong meter data, voltage problems or protection faults.

**One valid activity ID broke schedule extraction.** An ID such as
`__proto__` passed input checks but collided with a JavaScript object property.
The app rejected the resulting incomplete schedule. It did not report a false
feasible plan. We changed the internal schedule dictionary and added a
regression test for three such IDs. The corrected engine passes 28 tests.

## Calculation checks completed

| Test | Result | What it establishes |
| --- | --- | --- |
| Existing core suite | 28 tests passed | Calculation, input/output and solver-status checks, including the new ID repair |
| Python reference | 8 tests passed again | Agreement with the reference implementation under its assumptions |
| Seeded exhaustive audit | 60 scenarios, 120 mode-solves matched | 58 feasible and 62 infeasible outcomes agreed with separately written arithmetic |
| Other audit groups | 7 passed | Manual rota, zero prices, midnight completion, exact capacity, price/order invariance, invalid input and supported size |
| Supported size | 10 factories, 20 activities solved optimally in about 2 seconds | One benchmark on this machine, not a service-level guarantee |
| Solar study | 9 tests passed | Energy balances, same assumed output, fair independent comparison, solar-loss reserve and controls |

Both Python and JavaScript use HiGHS. Their agreement is not independent
solver validation. The small exhaustive checks use separate enumeration.
None of these tests validates a physical manufacturing process.

Audit commands:

```text
pnpm test:engine
node tests/robustness.mjs
python reference/test_scheduler.py
python reference/test_solar_scheduler.py
```

The machine-readable engine record is `stress-test/engine-audit.json`.
The older 22-group browser record remains dated separately. A fresh browser
walkthrough of the original deployed core passed 11 groups. It checked bad
capacity, stale-export blocking, infeasible background load, four stress
presets, invalid activity inputs, operator refusal and all three phone
sections. No page-wide overflow appeared at a 390-pixel phone viewport.
Wide tables retain their own horizontal scroll. The record is
`stress-test/live-ui-audit.json`. This does not repeat every old browser check
or certify the pending deployment. Rapid automated input changes needed a
settled-state check before the validation click.

## Results that survive the tests

The original grid-only example still gives INR 12,500 / 11,300 / 11,300 in
energy charges and 200 / 200 / 140 kW peaks. Exceedances are 8 / 8 / 0
fifteen-minute intervals. Energy remains 1,500 kWh in every plan. Coordination
adds zero charge saving. A tighter 90 kW limit adds INR 240 over independent
planning. Flat prices remove charge savings. Locked activities can be infeasible.

The solar study uses the same existing PV in all plans. With five assumed
equal batches, purchased-electricity CO2 falls from 184.6 to 149.1 kg per
batch against the original, a 19.23% change. The annual CEA factor is dated
FY 2024-25. This is not a whole-factory or marginal-grid emissions claim.
Coordination adds no extra forecast CO2 saving over solar-aware independent
planning. Its full-PV-loss reserve addresses the shared-capacity risk.

No PV, fully absorbed PV or locked timing removes the carbon improvement.
We do not treat the 19.23% as a forecast for Indian foundries. The rectangle
of PV availability, flexible window and five equal batches are assumptions.
We have not measured actual output or product quality.

## What we would solve, and why

| Problem | Decision | Reason and required evidence |
| --- | --- | --- |
| Invalid data, stale exports or lost activities | Fix in the prototype | These can invalidate the result. Reject bad inputs and check every returned schedule. |
| Solar suddenly falls | Reserve capacity for full PV loss | This failure appears in our own simulation. The conservative constraint works for declared loads. |
| No schedule fits approved limits | Report infeasible | Dropping work or moving locked activities would hide the actual problem. Supervisors must revise the conditions. |
| Simple manual planning performs equally well | Compare it and stop the paid offer if needed | Automation has value only if it saves verified effort or improves outcomes after its costs. |
| Unsafe furnace or cooling changes | Keep those activities fixed | A scheduler cannot infer metallurgy, safety or quality rules from a power profile. A process expert must approve flexibility. |
| Wrong background loads or double counting | Reconcile meter and activity data before a pilot | A mathematically valid answer to duplicated loads is still wrong. Source labels cannot verify measurements. |
| Unknown shared connection or separate bills | Require a verified boundary and owner | Proximity does not create an electrical bottleneck or a payer. No shared boundary means no cluster-capacity claim. |
| kVA, power factor, voltage or protection | Require an electrical review | Active kW constraints alone cannot certify an installation. The prototype has no power-flow or protection model. |
| Monthly bill savings and upgrade value | Add only with the actual tariff and engineering quote | One synthetic day and 60 kW headroom cannot prove a bill reduction or a necessary upgrade. |
| Participant fairness | Show each factory's outcome and require consent | Some tighter-limit schedules cost more. We cannot promise compensation without a funded, agreed benefit pool. |
| Machine-load inference from 15-minute data | Defer | Several machines can create similar aggregate readings. We need ground-truth equipment data before claiming identification. |
| Carbon credits or certified footprints | Defer | The study covers purchased-electricity CO2 only. Credit eligibility and whole-plant accounting require separate evidence. |
| Real-time equipment control | Exclude from this prototype | A deployed controller needs live measurements, fail-safe behaviour, access controls and plant authorisation. |
| Larger, multi-day or uncertain workloads | Benchmark and extend only after a site case | We cap the current app at one day, 10 factories and 20 activities. Solver limits return an unproven status. |
| Shared cloud data and user accounts | Add only for an approved pilot | Local processing keeps the demo simple. A live service needs consent, access controls, retention rules and support. |

## Commercial stop rules

The proposed INR 5,000 monthly cluster fee has no validated payer yet. The
future INR 68,400 pilot budget is an estimate. At that upfront cost and fee,
a customer needs INR 10,700 gross monthly incremental benefit for a 12-month
simple payback, before other running costs. Do not count savings the customer
already gets from independent or manual planning as extra software value.

We would stop or narrow the cluster offer if the site lacks a common boundary,
safe flexibility, credible data or enough extra value. We would remove the
solar claim for sites without otherwise curtailed PV or valid accounting
attributes. Existing PV is a site condition, not a purchase funded by the demo.
We would test factory-only advice separately if its own economics hold.

The next field step is a consenting supervisor and an electrical reviewer.
They should validate one auxiliary activity and at least 14 days of inputs.
A supervised trial can follow only after the replay passes. No amount of
extra coding replaces that evidence.
