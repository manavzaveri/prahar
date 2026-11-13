"""Reproducible solar scheduling study, separate from PRAHAR's browser app.

Synthetic inputs, existing owner-retained PV, no exports and no battery.
This estimates purchased-electricity CO2 using one dated annual grid factor.
It does not estimate marginal system emissions or certify production quality.
"""
from __future__ import annotations

from dataclasses import dataclass
from math import isfinite
from pathlib import Path
import csv
import json

from scheduler import Scenario, example, metrics as gross_metrics, validate as validate_base
import numpy as np
from scipy.optimize import Bounds, LinearConstraint, milp
from scipy.sparse import csr_matrix, vstack

FACTOR = {
    "kg_co2_per_kwh": 0.710,
    "source": "Central Electricity Authority, CO2 Baseline Database, version 21.0, November 2025",
    "year": "FY 2024-25",
    "table": "Table S, report page 1 (PDF page 7), weighted average including RES and captive injection, adjusted for cross-border transfers",
    "url": "https://cea.nic.in/api/cdm-report-version/view-pdf/hi/78",
    "method": "Annual average inventory illustration, not hourly or marginal avoided emissions",
}


@dataclass(frozen=True)
class SolarStudy:
    base: Scenario
    pv_available_kw: dict[str, tuple[float, ...]]
    assumed_batches: float = 5.0
    grid_factor: float = FACTOR["kg_co2_per_kwh"]
    reserve_for_full_pv_loss: bool = True


def validate(s: SolarStudy) -> None:
    validate_base(s.base)
    if set(s.pv_available_kw) != set(s.base.fixed_kw):
        raise ValueError("Every factory needs its own PV profile")
    n = len(s.base.tariff_inr_kwh)
    if any(len(p) != n or any(not isfinite(x) or x < 0 for x in p)
           for p in s.pv_available_kw.values()):
        raise ValueError("PV profiles must be finite, non-negative and match the time grid")
    if not isfinite(s.assumed_batches) or s.assumed_batches <= 0:
        raise ValueError("The assumed output must be positive")
    if not isfinite(s.grid_factor) or s.grid_factor < 0:
        raise ValueError("The grid factor must be finite and non-negative")
    if type(s.reserve_for_full_pv_loss) is not bool:
        raise ValueError("The PV-loss reserve setting must be boolean")


def measure(s: SolarStudy, starts: dict[str, int]) -> dict:
    validate(s)
    b = s.base
    gross = gross_metrics(b, starts)
    loads = {u: np.array(p, dtype=float) for u, p in b.fixed_kw.items()}
    for j in b.jobs:
        t = starts[j.job_id]
        loads[j.unit_id][t:t+j.duration_slots] += j.power_kw
    dt = b.slot_minutes / 60
    imports = {u: np.maximum(0, load - np.array(s.pv_available_kw[u]))
               for u, load in loads.items()}
    used = {u: np.minimum(load, np.array(s.pv_available_kw[u])) for u, load in loads.items()}
    grid = sum(imports.values())
    available_kwh = sum(sum(p) for p in s.pv_available_kw.values()) * dt
    used_kwh = sum(float(p.sum()) for p in used.values()) * dt
    grid_kwh = float(grid.sum() * dt)
    co2 = grid_kwh * s.grid_factor
    return {
        "starts": starts, "gross_energy_kwh": gross["energy_kwh"],
        "pv_available_kwh": float(available_kwh), "pv_used_kwh": used_kwh,
        "pv_curtailed_kwh": float(available_kwh - used_kwh), "grid_import_kwh": grid_kwh,
        "energy_charge_inr": float(np.dot(grid, b.tariff_inr_kwh) * dt),
        "grid_peak_kw": float(grid.max()),
        "shared_limit_exceedance_slots": int(np.count_nonzero(grid > b.feeder_capacity_kw + 1e-7)),
        "full_pv_loss_peak_kw": gross["cluster_peak_kw"],
        "full_pv_loss_exceedance_slots": gross["feeder_exceedance_slots"],
        "assumed_completed_batches": s.assumed_batches,
        "gross_kwh_per_assumed_batch": gross["energy_kwh"] / s.assumed_batches,
        "purchased_electricity_co2_kg": co2,
        "kg_co2_per_assumed_batch": co2 / s.assumed_batches,
        "violations": gross["violations"], "grid_kw": grid.tolist(),
        "unit_gross_kw": {u: p.tolist() for u, p in loads.items()},
        "unit_grid_kw": {u: p.tolist() for u, p in imports.items()},
    }


def optimize(s: SolarStudy, coordinated: bool) -> dict:
    """Minimise import energy charge, then total start indexes at that charge.

    Both modes see the identical owned-PV profiles and optimise their use.
    Coordination adds the shared import limit and, by default, reserves room
    for full PV loss. This protects only the declared loads and assumptions.
    """
    validate(s)
    b = s.base
    units = list(b.fixed_kw)
    n = len(b.tariff_inr_kwh)
    choices = [(j, t) for j in b.jobs for t in
               ([j.original_start] if j.locked else
                range(j.earliest_slot, j.deadline_slot-j.duration_slots+1))]
    nx = len(choices)
    width = nx + len(units) * n
    rows, lo, hi = [], [], []

    def add(row, lower, upper):
        rows.append(row); lo.append(lower); hi.append(upper)

    def active(u, k, machine=None):
        return {i: j.power_kw for i, (j, t) in enumerate(choices)
                if j.unit_id == u and t <= k < t+j.duration_slots
                and (machine is None or j.machine == machine)}

    for j in b.jobs:
        add({i: 1.0 for i, (jj, _) in enumerate(choices) if jj.job_id == j.job_id}, 1, 1)
    for ui, u in enumerate(units):
        for k in range(n):
            loadrow = active(u, k)
            add(loadrow, -np.inf, b.unit_capacity_kw[u] - b.fixed_kw[u][k])
            # gross load minus grid import cannot exceed available own PV.
            add({**loadrow, nx+ui*n+k: -1.0}, -np.inf,
                s.pv_available_kw[u][k] - b.fixed_kw[u][k])
    for u, machine in {(j.unit_id, j.machine) for j in b.jobs}:
        for k in range(n):
            add({i: 1.0 for i in active(u, k, machine)}, -np.inf, 1)
    if coordinated:
        for k in range(n):
            add({nx+ui*n+k: 1.0 for ui in range(len(units))}, -np.inf, b.feeder_capacity_kw)
            if s.reserve_for_full_pv_loss:
                add({i: j.power_kw for i,(j,t) in enumerate(choices) if t<=k<t+j.duration_slots},
                    -np.inf,b.feeder_capacity_kw-sum(p[k] for p in b.fixed_kw.values()))
    rr, cc, vv = [], [], []
    for ri, row in enumerate(rows):
        for ci, val in row.items():
            rr.append(ri); cc.append(ci); vv.append(val)
    A = csr_matrix((vv, (rr, cc)), shape=(len(rows), width))
    dt = b.slot_minutes / 60
    c = np.array([0.0]*nx + list(b.tariff_inr_kwh)*len(units)) * dt
    lower, upper = np.array(lo), np.array(hi)
    opts = dict(integrality=np.array([1]*nx + [0]*(width-nx)),
                bounds=Bounds(np.zeros(width), np.array([1.0]*nx + [np.inf]*(width-nx))),
                options={"time_limit": 30, "mip_rel_gap": 0})
    first = milp(c, constraints=LinearConstraint(A, lower, upper), **opts)
    if first.status == 2:
        return {"status": "infeasible", "reason": "No schedule respects the declared limits"}
    if first.status != 0:
        return {"status": "not_proven", "reason": str(first.message)}
    tie = np.array([float(t) for _, t in choices] + [0.0]*(width-nx))
    A2 = vstack([A, csr_matrix(c.reshape(1, -1))], format="csr")
    second = milp(tie, constraints=LinearConstraint(A2, np.append(lower, -np.inf),
                  np.append(upper, first.fun + 1e-6)), **opts)
    x = second.x if second.status == 0 else first.x
    starts = {j.job_id: t for (j, t), value in zip(choices, x[:nx]) if value > 0.5}
    result = measure(s, starts)
    if result["violations"] or (coordinated and result["shared_limit_exceedance_slots"]):
        raise RuntimeError("The schedule failed post-solve feasibility checks")
    if coordinated and s.reserve_for_full_pv_loss and result["full_pv_loss_exceedance_slots"]:
        raise RuntimeError("The schedule failed its full-PV-loss reserve check")
    if abs(result["energy_charge_inr"] - first.fun) > 1e-4:
        raise RuntimeError("Post-solve energy charges differ from the solver objective")
    return {"status": "optimal", "tie_break_proven": second.status == 0, **result}


def compare(s: SolarStudy) -> dict:
    return {"original": {"status": "simulated_original", **measure(s, {j.job_id: j.original_start for j in s.base.jobs})},
            "independent": optimize(s, False), "coordinated": optimize(s, True)}


def example_solar() -> SolarStudy:
    b = example()
    return SolarStudy(b, {u: tuple(35.0 if 40 <= k < 56 else 0.0 for k in range(96))
                          for u in b.fixed_kw})


def export(directory: Path) -> dict:
    from dataclasses import asdict, replace
    directory.mkdir(parents=True, exist_ok=True)
    s = example_solar()
    cases = {
        "existing_curtailed_pv": s,
        "no_pv_control": replace(s, pv_available_kw={u: (0.0,)*96 for u in s.base.fixed_kw}),
        "locked_jobs_control": replace(s, base=replace(s.base, feeder_capacity_kw=220.0,
            jobs=tuple(replace(j, locked=True) for j in s.base.jobs))),
        "fully_absorbed_pv_control": replace(s, pv_available_kw={u: tuple(5.0 if 40 <= k < 56 else 0.0 for k in range(96))
                                                                for u in s.base.fixed_kw}),
    }
    result = {"date": "2026-11-13", "factor": FACTOR,
              "scope": "Synthetic companion study. Same existing PV in every plan; no export, no battery, owner retains PV attributes. Five assumed equal batches. Coordinated planning reserves capacity for full PV loss, for the declared loads. Browser app remains grid-only.",
              "cases": {name: {"inputs": asdict(case), "results": compare(case)} for name, case in cases.items()}}
    (directory / "solar-study.json").write_text(json.dumps(result, separators=(",", ":")) + "\n", encoding="utf-8")
    fields = ["case", "plan", "status", "gross_energy_kwh", "pv_available_kwh", "pv_used_kwh", "pv_curtailed_kwh",
              "grid_import_kwh", "energy_charge_inr", "grid_peak_kw", "shared_limit_exceedance_slots", "full_pv_loss_peak_kw", "full_pv_loss_exceedance_slots",
              "assumed_completed_batches", "gross_kwh_per_assumed_batch", "purchased_electricity_co2_kg", "kg_co2_per_assumed_batch"]
    with (directory / "solar-summary.csv").open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for name, case in result["cases"].items():
            for plan, m in case["results"].items():
                writer.writerow({"case": name, "plan": plan, **m})
    with (directory / "solar-intervals.csv").open("w", newline="", encoding="utf-8") as stream:
        writer = csv.writer(stream)
        writer.writerow(["plan", "factory", "slot", "time", "gross_kw", "pv_available_kw", "pv_used_kw", "grid_import_kw", "pv_curtailed_kw"])
        for plan, m in result["cases"]["existing_curtailed_pv"]["results"].items():
            for u, loads in m["unit_gross_kw"].items():
                for k, load in enumerate(loads):
                    pv = s.pv_available_kw[u][k]
                    writer.writerow([plan, u, k, f"{k//4:02d}:{(k%4)*15:02d}", load, pv, min(load,pv), max(0,load-pv), max(0,pv-load)])
    return result


if __name__ == "__main__":
    r = export(Path(__file__).resolve().parents[1] / "docs" / "solar-study")
    for name, case in r["cases"].items():
        print(name, {plan: {k: m.get(k) for k in ["status", "grid_import_kwh", "kg_co2_per_assumed_batch"]}
                     for plan, m in case["results"].items()})
