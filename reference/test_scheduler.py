"""Independent conservation, billing-scope and infeasibility checks."""
import unittest
from dataclasses import replace
from itertools import product
from scheduler import Scenario, Job, compare, example, metrics, optimize


class SchedulingTests(unittest.TestCase):
    def test_three_way_comparison_preserves_energy_and_separates_network_value(self):
        r = compare(example())
        for mode in r.values():
            self.assertAlmostEqual(mode["energy_kwh"], 1500)
            self.assertFalse(mode["violations"])
        self.assertAlmostEqual(r["current"]["energy_charge_inr"], 12500)
        self.assertAlmostEqual(r["independent"]["energy_charge_inr"], 11300)
        self.assertAlmostEqual(r["coordinated"]["energy_charge_inr"], 11300)
        self.assertAlmostEqual(r["independent"]["cluster_peak_kw"], 200)
        self.assertLessEqual(r["coordinated"]["cluster_peak_kw"], 140)
        self.assertEqual(r["coordinated"]["feeder_exceedance_slots"], 0)

    def test_refusal_locks_original_start(self):
        s = example()
        s = replace(s, jobs=(replace(s.jobs[0], locked=True),)+s.jobs[1:])
        r = optimize(s, True)
        self.assertEqual(r["status"], "optimal")
        self.assertEqual(r["starts"][s.jobs[0].job_id], 72)

    def test_infeasible_feeder_does_not_create_fictitious_schedule(self):
        self.assertEqual(optimize(replace(example(), feeder_capacity_kw=70), True)["status"], "infeasible")

    def test_no_flexibility_has_no_energy_charge_saving(self):
        s = example()
        s = replace(s, jobs=tuple(replace(j, locked=True) for j in s.jobs), feeder_capacity_kw=250)
        r = compare(s)
        self.assertEqual(r["current"]["energy_charge_inr"], r["coordinated"]["energy_charge_inr"])

    def test_flat_tariff_has_no_pure_shifting_energy_charge_saving(self):
        s = replace(example(), tariff_inr_kwh=(8.0,)*96)
        r = compare(s)
        self.assertAlmostEqual(r["current"]["energy_charge_inr"], r["coordinated"]["energy_charge_inr"])

    def test_solver_cost_matches_independent_exhaustive_search(self):
        s = Scenario((Job('A','F',3,2,0,6,0,'M1'), Job('B','F',2,2,1,6,2,'M2')),
                     {'F':(1.0,)*6},{'F':5.0},(10.,8.,2.,2.,7.,10.),5.,15)
        feasible=[]
        for a,b in product(range(5),range(1,5)):
            m=metrics(s,{'A':a,'B':b})
            if not m['violations'] and not m['feeder_exceedance_slots']:
                feasible.append(m['energy_charge_inr'])
        self.assertAlmostEqual(optimize(s,True)['energy_charge_inr'],min(feasible))

    def test_machine_overlap_is_detected(self):
        s=Scenario((Job('A','F',2,2,0,6,0,'M'),Job('B','F',2,2,0,6,2,'M')),
                   {'F':(0.,)*6},{'F':10.},(8.,)*6,10.)
        self.assertTrue(metrics(s,{'A':0,'B':0})['violations'])
        self.assertFalse(optimize(s,True)['violations'])

    def test_invalid_data_and_empty_fixed_case(self):
        with self.assertRaises(ValueError):
            optimize(replace(example(),tariff_inr_kwh=(-1.,)*96),True)
        s=replace(example(),jobs=())
        self.assertEqual(optimize(s,True)['status'],'optimal')
        self.assertEqual(optimize(replace(s,feeder_capacity_kw=40),True)['status'],'infeasible')


if __name__=='__main__':
    unittest.main(verbosity=2)
