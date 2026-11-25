import Mathlib
import MAIS_O47
import MAIS_O47_Checks

/-!
# MAIS-O47: the one-coordinate bound, lifted to the data law

Issue #37, Section 1, second step: "fix the other input coordinates" and
integrate, so that

`L(W, b) ≥ v · ∑ᵢ (1 − aᵢ)₊²`, with `aᵢ = ‖Wᵢ‖² = (WᵀW)ᵢᵢ`.

Output `i`'s preactivation is `aᵢ xᵢ` plus a term that does not depend on
`xᵢ`. Under the product law the coordinate `xᵢ` is split off
(`measurePreserving_piFinSuccAbove`), the inner integral over `xᵢ` is bounded by
`row_lower_bound`, and the outer integral of that constant is the constant.
Columns with `aᵢ > 1` contribute `0` to the bound and a nonnegative amount to
the loss.

Written by an AI agent (Claude). No person has reviewed it.
-/

namespace IntegralAscent.MAIS.O47

open MeasureTheory Matrix

/-! ## The data law is a probability measure carried by the cube -/

instance coordLaw_isFinite (S : ℝ) : IsFiniteMeasure (coordLaw S) :=
  ⟨by simp [coordLaw, Real.volume_Icc, ENNReal.add_lt_top]⟩

instance coordLaw_isProb {S : ℝ} [Fact (0 ≤ S)] [Fact (S ≤ 1)] :
    IsProbabilityMeasure (coordLaw S) :=
  ⟨coordLaw_univ (Fact.out) (Fact.out)⟩

/-- Almost every draw from the coordinate law lies in `[0,1]`. -/
theorem coordLaw_ae_Icc (S : ℝ) : ∀ᵐ x ∂(coordLaw S), x ∈ Set.Icc (0 : ℝ) 1 := by
  rw [coordLaw, ae_add_measure_iff]
  constructor
  · refine Measure.ae_smul_measure ?_ _
    exact (ae_dirac_iff (measurableSet_Icc (a := (0 : ℝ)) (b := 1))).2 (by simp)
  · exact Measure.ae_smul_measure (ae_restrict_mem measurableSet_Icc) _

/-- Almost every draw from the data law lies in the cube `[0,1]ᵐ`. -/
theorem dataLaw_ae_cube (m : ℕ) (S : ℝ) :
    ∀ᵐ x ∂(dataLaw m S), x ∈ Set.univ.pi (fun _ : Fin m => Set.Icc (0 : ℝ) 1) := by
  have h : ∀ i : Fin m, ∀ᵐ x ∂(dataLaw m S), x i ∈ Set.Icc (0 : ℝ) 1 := fun i =>
    Measure.tendsto_eval_ae_ae.eventually (coordLaw_ae_Icc S)
  filter_upwards [ae_all_iff.2 h] with x hx
  exact Set.mem_univ_pi.2 hx

/-- A continuous function is integrable against the data law, for `0 ≤ S ≤ 1`. -/
theorem integrable_dataLaw {m : ℕ} {S : ℝ} (h0 : 0 ≤ S) (h1 : S ≤ 1)
    {f : (Fin m → ℝ) → ℝ} (hf : Continuous f) : Integrable f (dataLaw m S) := by
  have : Fact (0 ≤ S) := ⟨h0⟩
  have : Fact (S ≤ 1) := ⟨h1⟩
  have hK : IsCompact (Set.univ.pi (fun _ : Fin m => Set.Icc (0 : ℝ) 1)) :=
    isCompact_univ_pi fun _ => isCompact_Icc
  have : IsProbabilityMeasure (dataLaw m S) := by unfold dataLaw; infer_instance
  have h := hf.continuousOn.integrableOn_compact (μ := dataLaw m S) hK
  rwa [IntegrableOn, Measure.restrict_eq_self_of_ae_mem (dataLaw_ae_cube m S)] at h

/-! ## One output at a time -/

/-- The diagonal of the Gram matrix, the squared length of column `i`, is nonnegative. -/
theorem gram_diag_nonneg {n m : ℕ} (W : Matrix (Fin n) (Fin m) ℝ) (i : Fin m) :
    0 ≤ (Wᵀ * W) i i := by
  rw [Matrix.mul_apply]
  exact Finset.sum_nonneg fun k _ => by simpa [Matrix.transpose_apply] using mul_self_nonneg (W k i)

/-- Output `i`'s term of the task loss is at least `(1 − aᵢ)₊² v`. -/
theorem output_lower_bound {n k : ℕ} {S : ℝ} (h0 : 0 ≤ S) (h1 : S ≤ 1)
    (p : Params n (k + 1)) (i : Fin (k + 1)) :
    (max (1 - (p.1ᵀ * p.1) i i) 0) ^ 2 * coordVar S ≤
      ∫ x, (x i - network p x i) ^ 2 ∂(dataLaw (k + 1) S) := by
  have : Fact (0 ≤ S) := ⟨h0⟩
  have : Fact (S ≤ 1) := ⟨h1⟩
  set G := p.1ᵀ * p.1 with hG
  set a := G i i
  have ha0 : 0 ≤ a := gram_diag_nonneg p.1 i
  have hv : 0 ≤ coordVar S := by
    unfold coordVar; have : 0 ≤ (1 - S) * (1 + 3 * S) := by nlinarith
    linarith
  set f : (Fin (k + 1) → ℝ) → ℝ := fun x => (x i - network p x i) ^ 2 with hf
  have hfc : Continuous f := by
    simp only [hf, network]; fun_prop
  rcases le_total a 1 with ha1 | ha1
  · -- Split off coordinate `i`.
    have e := measurePreserving_piFinSuccAbove (fun _ : Fin (k + 1) => coordLaw S) i
    have hint : Integrable f (dataLaw (k + 1) S) := integrable_dataLaw h0 h1 hfc
    set g : ℝ × (Fin k → ℝ) → ℝ := fun q => f ((MeasurableEquiv.piFinSuccAbove
      (fun _ : Fin (k + 1) => ℝ) i).symm q) with hg
    have hcomp : g ∘ (MeasurableEquiv.piFinSuccAbove (fun _ : Fin (k + 1) => ℝ) i) = f := by
      funext x; simp only [hg, Function.comp_apply, MeasurableEquiv.symm_apply_apply]
    have hgint : Integrable g ((coordLaw S).prod (Measure.pi fun _ : Fin k => coordLaw S)) := by
      have := e.integrable_comp_emb
        (MeasurableEquiv.piFinSuccAbove (fun _ : Fin (k + 1) => ℝ) i).measurableEmbedding (g := g)
      rw [hcomp] at this
      exact this.1 hint
    have htrans : ∫ x, f x ∂(dataLaw (k + 1) S)
        = ∫ q, g q ∂((coordLaw S).prod (Measure.pi fun _ : Fin k => coordLaw S)) := by
      rw [← e.integral_comp' g]
      exact congrArg (fun F => ∫ x, F x ∂(dataLaw (k + 1) S)) hcomp.symm
    rw [htrans, integral_prod_symm g hgint]
    -- The inner integral, for fixed values `y` of the other coordinates.
    have inner : ∀ y : Fin k → ℝ, (max (1 - a) 0) ^ 2 * coordVar S ≤ ∫ t, g (t, y) ∂(coordLaw S) := by
      intro y
      set z := ∑ j, G i (i.succAbove j) * y j + p.2 i
      have hgt : ∀ t, g (t, y) = (t - max (a * t + z) 0) ^ 2 := by
        intro t
        simp only [hg, hf, network, MeasurableEquiv.piFinSuccAbove_symm_apply,
          Fin.insertNthEquiv_apply, Fin.insertNth_apply_same, Pi.add_apply, Matrix.mulVec,
          dotProduct]
        rw [Fin.sum_univ_succAbove _ i]
        simp only [Fin.insertNth_apply_same, Fin.insertNth_apply_succAbove, ← hG]
        congr 2
        simp only [z, a]; ring_nf
      simp_rw [hgt]
      rw [max_eq_left (by linarith)]
      exact row_lower_bound h0 h1 ha0 ha1
    calc (max (1 - a) 0) ^ 2 * coordVar S
        = ∫ _y, (max (1 - a) 0) ^ 2 * coordVar S ∂(Measure.pi fun _ : Fin k => coordLaw S) := by
          simp
      _ ≤ _ := by
          refine integral_mono (integrable_const _) hgint.integral_prod_right inner
  · -- A long column: the bound is `0`.
    rw [max_eq_right (by linarith)]
    simp only [ne_eq, OfNat.ofNat_ne_zero, not_false_eq_true, zero_pow, zero_mul]
    exact integral_nonneg fun x => sq_nonneg _

/-! ## The lifted bound -/

/-- Issue #37, Section 1: `L(W, b) ≥ v · ∑ᵢ (1 − aᵢ)₊²`, with `aᵢ = (WᵀW)ᵢᵢ`,
for `0 ≤ S ≤ 1`. -/
theorem taskLoss_lower_bound {n m : ℕ} {S : ℝ} (h0 : 0 ≤ S) (h1 : S ≤ 1) (p : Params n m) :
    coordVar S * ∑ i, (max (1 - (p.1ᵀ * p.1) i i) 0) ^ 2 ≤ taskLoss S p := by
  cases m with
  | zero => simp [taskLoss]
  | succ k =>
    unfold taskLoss
    rw [integral_finsetSum _ (fun i _ => integrable_dataLaw h0 h1 (by simp only [network]; fun_prop)),
      Finset.mul_sum]
    exact Finset.sum_le_sum fun i _ => by
      rw [mul_comm]; exact output_lower_bound h0 h1 p i

end IntegralAscent.MAIS.O47
