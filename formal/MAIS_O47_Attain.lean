import Mathlib
import MAIS_O47
import MAIS_O47_Checks
import MAIS_O47_Lift
import MAIS_O47_Matrix
import MAIS_O47_LowerBound

/-!
# MAIS-O47: issue #37's minimum is attained, and its value

Issue #37, Section 1, names a representative minimiser: `n` orthonormal
columns, `m − n` zero columns, bias `0` on the stored coordinates and
`(1 − S)/2` on the dropped ones. This file takes the standard basis for the
orthonormal columns (`storeRep`) and proves:

* `interference_storeW`: its penalty is `0`;
* `taskLoss_storeRep`: its task loss is `(m − n) v`, so its objective is
  `(m − n) v` for every `λ`;
* `objective_lower_bound`: `L + λR ≥ (m − n) v` for every `λ ≥ v`, which is
  `issue37LowerBound` without the issue's `n ≥ 1`, plus `R ≥ 0`;
* `storeRep_mem_argmin`: so for `λ ≥ v` the representative is a minimiser and
  the argmin is not empty;
* `issue37_minimum_value`: the second half of `Issue37StrongRegularisation`,
  exactly as stated in `MAIS_O47.lean`: every minimiser has objective
  `(m − n) v`.

The first half of `Issue37StrongRegularisation`, that the argmin is a single
orbit, needs the equality cases of the lower bound and is not proved here.

Written by an AI agent (Claude). No person has reviewed it.
-/

namespace IntegralAscent.MAIS.O47

open MeasureTheory Matrix

/-! ## The representative -/

/-- Columns `0, …, n−1` are the standard basis of `ℝⁿ`; the rest are `0`. -/
noncomputable def storeW (n m : ℕ) : Matrix (Fin n) (Fin m) ℝ :=
  fun i j => if (i : ℕ) = j then 1 else 0

/-- Bias `0` on stored coordinates, `(1 − S)/2`, the mean, on dropped ones. -/
noncomputable def storeB (n m : ℕ) (S : ℝ) : Fin m → ℝ :=
  fun j => if (j : ℕ) < n then 0 else (1 - S) / 2

/-- Issue #37's representative. -/
noncomputable def storeRep (n m : ℕ) (S : ℝ) : Params n m := (storeW n m, storeB n m S)

theorem gram_storeW (n m : ℕ) (j k : Fin m) :
    ((storeW n m)ᵀ * storeW n m) j k = if j = k ∧ (j : ℕ) < n then 1 else 0 := by
  rw [Matrix.mul_apply]
  simp only [transpose_apply, storeW]
  rw [Fin.sum_univ_eq_sum_range
    (fun i => (if i = (j : ℕ) then (1 : ℝ) else 0) * (if i = (k : ℕ) then 1 else 0)) n]
  simp only [ite_mul, one_mul, zero_mul]
  rw [Finset.sum_ite_eq' (Finset.range n) (j : ℕ)]
  by_cases hjk : j = k
  · subst hjk; simp [Finset.mem_range]
  · have : (j : ℕ) ≠ k := fun h => hjk (Fin.ext h)
    simp [hjk, this]

/-- The representative's penalty is `0`: distinct columns are orthogonal. -/
theorem interference_storeW (n m : ℕ) : interference (storeW n m) = 0 := by
  rw [interference_eq_gram]
  refine Finset.sum_eq_zero fun j _ => Finset.sum_eq_zero fun k _ => ?_
  by_cases hjk : j = k
  · simp [hjk]
  · simp [hjk, gram_storeW]

theorem gram_storeW_mulVec (n m : ℕ) (x : Fin m → ℝ) (j : Fin m) :
    (((storeW n m)ᵀ * storeW n m) *ᵥ x) j = if (j : ℕ) < n then x j else 0 := by
  simp only [mulVec, dotProduct, gram_storeW]
  by_cases hj : (j : ℕ) < n
  · simp [hj, ite_mul, Finset.sum_ite_eq]
  · simp [hj]

/-- On the cube, the representative's output is `xⱼ` on stored coordinates and
the mean on dropped ones. -/
theorem network_storeRep {n m : ℕ} {S : ℝ} (h1 : S ≤ 1) {x : Fin m → ℝ}
    (hx : ∀ j, x j ∈ Set.Icc (0 : ℝ) 1) (j : Fin m) :
    network (storeRep n m S) x j = if (j : ℕ) < n then x j else (1 - S) / 2 := by
  simp only [network, storeRep, Pi.add_apply, gram_storeW_mulVec, storeB]
  by_cases hj : (j : ℕ) < n
  · simp [hj, (hx j).1]
  · have : 0 ≤ (1 - S) / 2 := by linarith
    simp [hj, this]

/-- The marginal of one coordinate of the data law is the coordinate law. -/
theorem integral_dataLaw_eval {m : ℕ} {S : ℝ} (h0 : 0 ≤ S) (h1 : S ≤ 1)
    {g : ℝ → ℝ} (hg : Continuous g) (j : Fin m) :
    ∫ x, g (x j) ∂(dataLaw m S) = ∫ y, g y ∂(coordLaw S) := by
  have : Fact (0 ≤ S) := ⟨h0⟩
  have : Fact (S ≤ 1) := ⟨h1⟩
  have hmp : MeasurePreserving (Function.eval j) (dataLaw m S) (coordLaw S) :=
    measurePreserving_eval (fun _ => coordLaw S) j
  rw [← hmp.map_eq, integral_map (measurable_pi_apply j).aemeasurable
    hg.aestronglyMeasurable]

theorem sum_dropped (n m : ℕ) (hnm : n ≤ m) (c : ℝ) :
    ∑ j : Fin m, (if (j : ℕ) < n then (0 : ℝ) else c) = ((m : ℝ) - n) * c := by
  rw [Fin.sum_univ_eq_sum_range (fun i => if i < n then (0 : ℝ) else c) m,
    Finset.sum_ite, Finset.sum_const_zero, zero_add, Finset.sum_const, nsmul_eq_mul]
  congr 1
  have : (Finset.range m).filter (fun i => ¬ i < n) = Finset.Ico n m := by
    ext i; simp [Finset.mem_Ico, and_comm]
  rw [this, Nat.card_Ico, Nat.cast_sub hnm]

/-- The representative's task loss is `(m − n) v`. -/
theorem taskLoss_storeRep {n m : ℕ} {S : ℝ} (h0 : 0 ≤ S) (h1 : S ≤ 1) (hnm : n ≤ m) :
    taskLoss S (storeRep n m S) = ((m : ℝ) - n) * coordVar S := by
  have hae : (fun x => ∑ j, (x j - network (storeRep n m S) x j) ^ 2) =ᵐ[dataLaw m S]
      fun x => ∑ j : Fin m, (if (j : ℕ) < n then 0 else (x j - (1 - S) / 2) ^ 2) := by
    filter_upwards [dataLaw_ae_cube m S] with x hx
    have hx' : ∀ j, x j ∈ Set.Icc (0 : ℝ) 1 := fun j => Set.mem_univ_pi.1 hx j
    refine Finset.sum_congr rfl fun j _ => ?_
    rw [network_storeRep h1 hx' j]
    by_cases hj : (j : ℕ) < n <;> simp [hj]
  unfold taskLoss
  rw [integral_congr_ae hae, integral_finsetSum _ (fun j _ => integrable_dataLaw h0 h1
    (by by_cases h : (j : ℕ) < n <;> simp only [h, if_true, if_false] <;> fun_prop))]
  have hj : ∀ j : Fin m, ∫ x, (if (j : ℕ) < n then (0 : ℝ) else (x j - (1 - S) / 2) ^ 2)
      ∂(dataLaw m S) = if (j : ℕ) < n then 0 else coordVar S := by
    intro j
    by_cases h : (j : ℕ) < n
    · simp [h]
    · simp only [h, if_false]
      rw [integral_dataLaw_eval h0 h1 (g := fun y => (y - (1 - S) / 2) ^ 2) (by fun_prop) j,
        coordLaw_variance h0 h1]
  simp only [hj]
  exact sum_dropped n m hnm _

theorem objective_storeRep {n m : ℕ} {S : ℝ} (h0 : 0 ≤ S) (h1 : S ≤ 1) (hnm : n ≤ m)
    (lam : ℝ) : objective S lam (storeRep n m S) = ((m : ℝ) - n) * coordVar S := by
  simp only [objective, storeRep, interference_storeW, mul_zero, add_zero]
  exact taskLoss_storeRep h0 h1 hnm

/-! ## The lower bound for every `λ ≥ v` -/

theorem interference_nonneg {n m : ℕ} (W : Matrix (Fin n) (Fin m) ℝ) : 0 ≤ interference W :=
  Finset.sum_nonneg fun i _ => Finset.sum_nonneg fun j _ => by
    split_ifs
    · exact le_rfl
    · positivity

/-- `L + λR ≥ (m − n) v` for every `λ ≥ v`. No `n ≥ 1` is needed. -/
theorem objective_lower_bound {n m : ℕ} {S lam : ℝ} (h0 : 0 ≤ S) (h1 : S ≤ 1)
    (hlam : coordVar S ≤ lam) (p : Params n m) :
    ((m : ℝ) - n) * coordVar S ≤ objective S lam p := by
  have hv := coordVar_nonneg h0 h1
  have hL := taskLoss_lower_bound h0 h1 p
  have hM := le_posPart_sq_add_interference p.1
  have hR := interference_nonneg p.1
  unfold objective
  unfold interference at hR ⊢
  nlinarith [mul_le_mul_of_nonneg_right hM hv, mul_le_mul_of_nonneg_right hlam hR]

/-- For `λ ≥ v` and `n ≤ m`, the representative is a minimiser. -/
theorem storeRep_mem_argmin {n m : ℕ} {S lam : ℝ} (h0 : 0 ≤ S) (h1 : S ≤ 1) (hnm : n ≤ m)
    (hlam : coordVar S ≤ lam) : storeRep n m S ∈ argminSet (n := n) (m := m) S lam :=
  fun q => (objective_storeRep h0 h1 hnm lam).symm ▸ objective_lower_bound h0 h1 hlam q

/-- The second half of `Issue37StrongRegularisation`, with its hypotheses: every
minimiser has objective `(m − n) v`. -/
theorem issue37_minimum_value :
    ∀ (n m : ℕ) (S lam : ℝ), 1 ≤ n → n < m → 0 ≤ S → S < 1 → coordVar S < lam →
      ∀ p ∈ argminSet (n := n) (m := m) S lam,
        objective S lam p = ((m : ℝ) - n) * coordVar S := by
  intro n m S lam _ hnm h0 h1 hlam p hp
  refine le_antisymm ?_ (objective_lower_bound h0 h1.le hlam.le p)
  have := hp (storeRep n m S)
  rwa [objective_storeRep h0 h1.le hnm.le] at this

/-- The argmin is not empty for `λ ≥ v`. -/
theorem argmin_nonempty {n m : ℕ} {S lam : ℝ} (h0 : 0 ≤ S) (h1 : S ≤ 1) (hnm : n ≤ m)
    (hlam : coordVar S ≤ lam) : (argminSet (n := n) (m := m) S lam).Nonempty :=
  ⟨_, storeRep_mem_argmin h0 h1 hnm hlam⟩

#print axioms taskLoss_storeRep
#print axioms issue37_minimum_value
#print axioms argmin_nonempty

end IntegralAscent.MAIS.O47
