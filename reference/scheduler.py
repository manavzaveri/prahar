"""PRAHAR development model. Synthetic research prototype, not a billing system.

Pure load shifting conserves kWh. A shared feeder limit creates a constraint,
not an automatic revenue stream. Prices are explicit inputs in INR/kWh.
"""
from __future__ import annotations

from dataclasses import dataclass, replace
from math import isfinite
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent / "vendor"))
import numpy as np
from scipy.optimize import Bounds, LinearConstraint, milp
from scipy.sparse import csr_matrix, vstack


@dataclass(frozen=True)
class Job:
    job_id: str
    unit_id: str
    power_kw: float
    duration_slots: int
    earliest_slot: int
    deadline_slot: int  # exclusive end; a job must finish by this time
    original_start: int
    machine: str = "auxiliary"
    locked: bool = False


@dataclass(frozen=True)
class Scenario:
    jobs: tuple[Job, ...]
    fixed_kw: dict[str, tuple[float, ...]]
    unit_capacity_kw: dict[str, float]
    tariff_inr_kwh: tuple[float, ...]
    feeder_capacity_kw: float
    slot_minutes: int = 15
    provenance: str = "SIMULATED: fictional units, loads, flexibility and tariff"


def validate(s: Scenario) -> None:
    n = len(s.tariff_inr_kwh)
    if n == 0 or type(s.slot_minutes) is not int or s.slot_minutes <= 0:
        raise ValueError("A positive time grid and tariff are required")
    if not isfinite(s.feeder_capacity_kw) or s.feeder_capacity_kw <= 0:
        raise ValueError("Feeder capacity must be finite and positive")
    if not all(isfinite(v) and v >= 0 for v in s.tariff_inr_kwh):
        raise ValueError("This prototype accepts finite, non-negative energy prices")
    if not s.fixed_kw or set(s.fixed_kw) != set(s.unit_capacity_kw):
        raise ValueError("Every factory needs a fixed-load profile and a capacity")
    for unit, profile in s.fixed_kw.items():
        if len(profile) != n or not all(isfinite(v) and v >= 0 for v in profile):
            raise ValueError(f"Invalid fixed-load profile: {unit}")
        cap = s.unit_capacity_kw[unit]
        if not isfinite(cap) or cap <= 0:
            raise ValueError(f"Invalid factory capacity: {unit}")
    if len({j.job_id for j in s.jobs}) != len(s.jobs):
        raise ValueError("Job IDs must be unique")
    for j in s.jobs:
        if j.unit_id not in s.fixed_kw or not isfinite(j.power_kw) or j.power_kw <= 0:
            raise ValueError(f"Invalid job power or factory: {j.job_id}")
        if any(type(v) is not int for v in (j.duration_slots, j.earliest_slot,
                                            j.deadline_slot, j.original_start)):
            raise ValueError(f"Job times must be integer slot indexes: {j.job_id}")
        if not (j.duration_slots > 0 and 0 <= j.earliest_slot < j.deadline_slot <= n):
            raise ValueError(f"Invalid operating window: {j.job_id}")
        if not (j.earliest_slot <= j.original_start and
                j.original_start + j.duration_slots <= j.deadline_slot):
            raise ValueError(f"Original job must respect its declared window: {j.job_id}")


def metrics(s: Scenario, starts: dict[str, int]) -> dict:
    validate(s)
    if set(starts) != {j.job_id for j in s.jobs}:
        raise ValueError("Schedule must contain every job exactly once")
    unit_loads = {u: np.array(p, dtype=float) for u, p in s.fixed_kw.items()}
    occupied: dict[tuple[str, str], np.ndarray] = {}
    violations = []
    for j in s.jobs:
        t = starts[j.job_id]
        if type(t) is not int or not j.earliest_slot <= t <= j.deadline_slot - j.duration_slots:
            raise ValueError(f"Schedule outside job window: {j.job_id}")
        if j.locked and t != j.original_start:
            raise ValueError(f"Refused change must retain original start: {j.job_id}")
        unit_loads[j.unit_id][t:t+j.duration_slots] += j.power_kw
        key = j.unit_id, j.machine
        occupied.setdefault(key, np.zeros(len(s.tariff_inr_kwh)))
        occupied[key][t:t+j.duration_slots] += 1
    for key, values in occupied.items():
        if np.any(values > 1):
            violations.append(f"machine overlap: {key}")
    for unit, load in unit_loads.items():
        if np.max(load) > s.unit_capacity_kw[unit] + 1e-7:
            violations.append(f"factory capacity: {unit}")
    aggregate = sum(unit_loads.values())
    dt = s.slot_minutes / 60
    tariff = np.array(s.tariff_inr_kwh)
    per_unit = {u: {"kwh": float(load.sum()*dt),
                    "energy_charge_inr": float(np.dot(load, tariff)*dt),
                    "peak_kw": float(load.max())}
                for u, load in unit_loads.items()}
    return {"energy_kwh": float(aggregate.sum()*dt),
            "energy_charge_inr": sum(x["energy_charge_inr"] for x in per_unit.values()),
            "cluster_peak_kw": float(aggregate.max()),
            "feeder_exceedance_slots": int(np.count_nonzero(aggregate > s.feeder_capacity_kw+1e-7)),
            "violations": violations, "per_unit": per_unit,
            "cluster_kw": aggregate.tolist(), "starts": starts,
            "scope": "Energy charge only; taxes, kVAh, monthly demand charges excluded",
            "provenance": s.provenance}


def optimize(s: Scenario, coordinated: bool) -> dict:
    """Exact MILP: minimum energy charge, then earliest starts at that charge.

    Both modes enforce each factory's capacity, machine exclusivity and approved
    windows. Only coordinated mode enforces the shared feeder capacity.
    Infeasibility is returned explicitly. An interrupted solve is never labelled optimal.
    """
    validate(s)
    if not s.jobs:
        m = metrics(s, {})
        if m["violations"] or (coordinated and m["feeder_exceedance_slots"]):
            return {"status": "infeasible", "reason": "Fixed loads already exceed capacity"}
        return {"status": "optimal", **m}
    n = len(s.tariff_inr_kwh)
    choices = [(j, t) for j in s.jobs for t in
               ([j.original_start] if j.locked else range(j.earliest_slot,
                                                          j.deadline_slot-j.duration_slots+1))]
    if any(not any(jj.job_id == j.job_id for jj, _ in choices) for j in s.jobs):
        return {"status": "infeasible", "reason": "An activity has no permitted start"}
    count = len(choices)
    rows, lo, hi = [], [], []

    def add(row, lower, upper):
        rows.append(row); lo.append(lower); hi.append(upper)

    for j in s.jobs:
        add([int(jj.job_id == j.job_id) for jj, _ in choices], 1, 1)
    machines = {(j.unit_id, j.machine) for j in s.jobs}
    for unit in s.fixed_kw:
        for k in range(n):
            add([j.power_kw if j.unit_id == unit and t <= k < t+j.duration_slots else 0
                 for j, t in choices], -np.inf, s.unit_capacity_kw[unit]-s.fixed_kw[unit][k])
    for machine in machines:
        for k in range(n):
            add([int((j.unit_id, j.machine) == machine and t <= k < t+j.duration_slots)
                 for j, t in choices], -np.inf, 1)
    if coordinated:
        for k in range(n):
            add([j.power_kw if t <= k < t+j.duration_slots else 0 for j, t in choices],
                -np.inf, s.feeder_capacity_kw-sum(p[k] for p in s.fixed_kw.values()))
    dt = s.slot_minutes / 60
    c = np.array([j.power_kw*sum(s.tariff_inr_kwh[t:t+j.duration_slots])*dt for j, t in choices])
    A = csr_matrix(np.array(rows, dtype=float))
    lower, upper = np.array(lo), np.array(hi)
    opts = dict(integrality=np.ones(count), bounds=Bounds(np.zeros(count), np.ones(count)),
                options={"time_limit": 20, "mip_rel_gap": 0})
    r = milp(c, constraints=LinearConstraint(A, lower, upper), **opts)
    if r.status == 2:
        return {"status": "infeasible", "reason": "No schedule satisfies the declared constraints"}
    if r.status != 0:
        return {"status": "not_proven", "reason": r.message}
    # Deterministic, documented tie-break avoids arbitrary staggered baseline claims.
    tie = np.array([t for j, t in choices], dtype=float)
    A2 = vstack([A, csr_matrix(c.reshape(1, -1))], format="csr")
    r2 = milp(tie, constraints=LinearConstraint(A2, np.append(lower, -np.inf),
                    np.append(upper, r.fun+1e-6)), **opts)
    x = r2.x if r2.status == 0 else r.x
    starts = {j.job_id: t for (j, t), v in zip(choices, x) if v > 0.5}
    m = metrics(s, starts)
    if m["violations"] or (coordinated and m["feeder_exceedance_slots"]):
        raise RuntimeError("Solver result failed independent feasibility checks")
    return {"status": "optimal", "tie_break_proven": r2.status == 0, **m}


def compare(s: Scenario) -> dict:
    result = {"current": {"status": "observed_simulation", **metrics(s, {j.job_id: j.original_start for j in s.jobs})},
              "independent": optimize(s, False), "coordinated": optimize(s, True)}
    return result


def example() -> Scenario:
    units = [f"F{i}" for i in range(1, 6)]
    return Scenario(
        jobs=tuple(Job(f"{u}-A1", u, 30, 8, 36, 84, 72) for u in units),
        fixed_kw={u: (10.0,)*96 for u in units},
        unit_capacity_kw={u: 100.0 for u in units},
        tariff_inr_kwh=tuple(6.0 if 36 <= k < 68 else 10.0 if k >= 68 else 8.0 for k in range(96)),
        feeder_capacity_kw=140.0,
    )


if __name__ == "__main__":
    import json
    print(json.dumps(compare(example()), indent=2))
