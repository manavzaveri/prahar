"""Meaningful controls for the companion model; no field-validation claim."""
import itertools
import unittest
from dataclasses import replace
from scheduler import Job, Scenario
from solar_scheduler import SolarStudy, example_solar, compare, measure, optimize, validate


class SolarTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.s = example_solar()
        cls.r = compare(cls.s)

    def test_mass_balance_workload_and_expected_result(self):
        for plan, m in self.r.items():
            self.assertEqual(m["gross_energy_kwh"], 1500)
            self.assertEqual(m["assumed_completed_batches"], 5)
            self.assertEqual(m["gross_kwh_per_assumed_batch"], 300)
            self.assertAlmostEqual(m["gross_energy_kwh"], m["grid_import_kwh"] + m["pv_used_kwh"])
            self.assertAlmostEqual(m["pv_available_kwh"], m["pv_used_kwh"] + m["pv_curtailed_kwh"])
            self.assertFalse(m["violations"])
        self.assertEqual(self.r["original"]["grid_import_kwh"], 1300)
        for plan in ["independent", "coordinated"]:
            m = self.r[plan]
            self.assertEqual(m["grid_import_kwh"], 1050)
            self.assertEqual(m["pv_used_kwh"], 450)
            self.assertAlmostEqual(m["purchased_electricity_co2_kg"], 745.5)
            self.assertAlmostEqual(m["kg_co2_per_assumed_batch"], 149.1)
            self.assertEqual(m["shared_limit_exceedance_slots"], 0)

    def test_solar_aware_independent_is_a_fair_comparator(self):
        for key in ["grid_import_kwh", "energy_charge_inr", "kg_co2_per_assumed_batch"]:
            self.assertAlmostEqual(self.r["independent"][key], self.r["coordinated"][key])
        individual_cost = 0.0
        for u in self.s.base.fixed_kw:
            b = replace(self.s.base, jobs=tuple(j for j in self.s.base.jobs if j.unit_id == u),
                        fixed_kw={u:self.s.base.fixed_kw[u]}, unit_capacity_kw={u:100.0})
            individual_cost += optimize(replace(self.s,base=b,pv_available_kw={u:self.s.pv_available_kw[u]}),False)["energy_charge_inr"]
        self.assertAlmostEqual(individual_cost, self.r["independent"]["energy_charge_inr"])

    def test_full_pv_loss_reserve_prevents_the_forecast_failure(self):
        self.assertEqual(self.r["independent"]["full_pv_loss_peak_kw"],200)
        self.assertEqual(self.r["independent"]["full_pv_loss_exceedance_slots"],8)
        self.assertEqual(self.r["coordinated"]["full_pv_loss_peak_kw"],140)
        self.assertEqual(self.r["coordinated"]["full_pv_loss_exceedance_slots"],0)
        for scale in [0,0.25,0.5,0.8,1]:
            actual=replace(self.s,pv_available_kw={u:tuple(scale*x for x in p) for u,p in self.s.pv_available_kw.items()})
            m=measure(actual,self.r["coordinated"]["starts"])
            self.assertEqual(m["shared_limit_exceedance_slots"],0)
        # The point-forecast-only option reproduces the failure we found.
        naive=optimize(replace(self.s,reserve_for_full_pv_loss=False),True)
        self.assertEqual(naive["full_pv_loss_exceedance_slots"],8)

    def test_no_solar_has_no_carbon_saving(self):
        r = compare(replace(self.s,pv_available_kw={u:(0.0,)*96 for u in self.s.base.fixed_kw}))
        for m in r.values():
            self.assertEqual(m["grid_import_kwh"], 1500)
            self.assertEqual(m["purchased_electricity_co2_kg"], 1065)

    def test_fully_absorbed_solar_has_no_carbon_saving(self):
        r=compare(replace(self.s,pv_available_kw={u:tuple(5.0 if 40<=k<56 else 0.0 for k in range(96)) for u in self.s.base.fixed_kw}))
        for m in r.values():
            self.assertEqual(m["pv_curtailed_kwh"],0)
            self.assertEqual(m["grid_import_kwh"],1400)

    def test_locked_activities_keep_their_original_time(self):
        b=replace(self.s.base,feeder_capacity_kw=220.0,jobs=tuple(replace(j,locked=True) for j in self.s.base.jobs))
        r=compare(replace(self.s,base=b))
        self.assertEqual(r["coordinated"]["grid_import_kwh"],r["original"]["grid_import_kwh"])
        self.assertEqual(r["coordinated"]["starts"],r["original"]["starts"])

    def test_impossible_capacity_is_infeasible(self):
        b=replace(self.s.base,jobs=tuple(replace(j,locked=True) for j in self.s.base.jobs))
        r=optimize(replace(self.s,base=b),True)
        self.assertEqual(r["status"],"infeasible")
        self.assertNotIn("grid_import_kwh",r)
        self.assertEqual(optimize(replace(self.s,base=replace(self.s.base,feeder_capacity_kw=40)),True)["status"],"infeasible")

    def test_small_case_matches_exhaustive_enumeration(self):
        b=Scenario(jobs=(Job("A","F",3,2,0,6,0,machine="A"),Job("B","F",2,2,0,6,2,machine="B")),
                   fixed_kw={"F":(1.0,)*6},unit_capacity_kw={"F":5},
                   tariff_inr_kwh=(8,5,2,2,5,8),feeder_capacity_kw=4)
        s=SolarStudy(b,{"F":(0,1,4,4,1,0)},assumed_batches=2)
        for coordinated in [False,True]:
            best=float("inf")
            for a,c in itertools.product(range(5),repeat=2):
                m=measure(s,{"A":a,"B":c})
                if not m["violations"] and (not coordinated or (not m["shared_limit_exceedance_slots"] and not m["full_pv_loss_exceedance_slots"])):
                    best=min(best,m["energy_charge_inr"])
            self.assertAlmostEqual(optimize(s,coordinated)["energy_charge_inr"],best)

    def test_invalid_inputs_are_rejected(self):
        for bad in [replace(self.s,assumed_batches=0),replace(self.s,grid_factor=float("nan")),
                    replace(self.s,pv_available_kw={}),replace(self.s,pv_available_kw={u:(-1,)*96 for u in self.s.base.fixed_kw})]:
            with self.assertRaises(ValueError):
                validate(bad)


if __name__ == "__main__":
    unittest.main(verbosity=2)
