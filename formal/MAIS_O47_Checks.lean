import Mathlib
import MAIS_O47

/-!
# MAIS-O47: facts that test the definitions

`MAIS_O47.lean` states the problem and proves nothing. This file proves small
facts about those definitions, so that a mistake in a definition has a chance
of showing up as a lemma that will not go through. None of this is a step of
issue #37's proof except the last section.

Written by an AI agent (Claude). No person has reviewed it.
-/

namespace IntegralAscent.MAIS.O47

open MeasureTheory Matrix

/-! ## The coordinate law -/

/-- For `0 ≤ S ≤ 1` the coordinate law has total mass `1`. -/
theorem coordLaw_univ {S : ℝ} (h0 : 0 ≤ S) (h1 : S ≤ 1) : coordLaw S Set.univ = 1 := by
  have h : ENNReal.ofReal S + ENNReal.ofReal (1 - S) = 1 := by
    rw [← ENNReal.ofReal_add h0 (by linarith)]; simp
  simpa [coordLaw] using h

/-- The integral of a continuous function against the coordinate law. -/
theorem integral_coordLaw {S : ℝ} (h0 : 0 ≤ S) (h1 : S ≤ 1) {f : ℝ → ℝ} (hf : Continuous f) :
    ∫ x, f x ∂(coordLaw S) = S * f 0 + (1 - S) * ∫ x in (0 : ℝ)..1, f x := by
  have hd : Integrable f (ENNReal.ofReal S • Measure.dirac (0 : ℝ)) :=
    (integrable_dirac (by simp)).smul_measure ENNReal.ofReal_ne_top
  have hr : Integrable f (ENNReal.ofReal (1 - S) • volume.restrict (Set.Icc (0 : ℝ) 1)) :=
    Integrable.smul_measure (hf.continuousOn.integrableOn_compact isCompact_Icc)
      ENNReal.ofReal_ne_top
  rw [coordLaw, integral_add_measure hd hr, integral_smul_measure, integral_smul_measure,
    integral_dirac, integral_Icc_eq_integral_Ioc, ← intervalIntegral.integral_of_le zero_le_one,
    ENNReal.toReal_ofReal h0, ENNReal.toReal_ofReal (by linarith)]
  simp [smul_eq_mul]

/-- The mean of a coordinate is `(1 - S) / 2`, issue #37's `μ`. -/
theorem coordLaw_mean {S : ℝ} (h0 : 0 ≤ S) (h1 : S ≤ 1) :
    ∫ x, x ∂(coordLaw S) = (1 - S) / 2 := by
  rw [integral_coordLaw h0 h1 (f := fun x => x) continuous_id, integral_id]; ring

/-- The variance of a coordinate is `coordVar S = (1 - S)(1 + 3S)/12`, issue
#37's `v`, written as the second moment about the mean. -/
theorem coordLaw_variance {S : ℝ} (h0 : 0 ≤ S) (h1 : S ≤ 1) :
    ∫ x, (x - (1 - S) / 2) ^ 2 ∂(coordLaw S) = coordVar S := by
  rw [integral_coordLaw h0 h1 (by fun_prop),
    intervalIntegral.integral_comp_sub_right (fun x => x ^ 2), integral_pow, coordVar]
  ring

/-! ## The group action leaves the penalty alone -/

/-- The penalty in terms of the Gram matrix `Wᵀ W`. -/
theorem interference_eq_gram {n m : ℕ} (W : Matrix (Fin n) (Fin m) ℝ) :
    interference W = ∑ i, ∑ j, if i = j then 0 else ((Wᵀ * W) i j) ^ 2 := by
  rfl

/-- The inverse of a permutation matrix is the permutation matrix of the
inverse. -/
theorem inv_permMatrix {m : ℕ} (σ : Equiv.Perm (Fin m)) :
    (σ.permMatrix ℝ)⁻¹ = (σ⁻¹).permMatrix ℝ := by
  apply Matrix.inv_eq_right_inv
  rw [← Matrix.permMatrix_mul]; simp

/-- The Gram matrix of `Q W P⁻¹` is that of `W` with rows and columns moved by
the same permutation. -/
theorem gram_act {n m : ℕ} (Q : Matrix.orthogonalGroup (Fin n) ℝ) (σ : Equiv.Perm (Fin m))
    (p : Params n m) (i j : Fin m) :
    (((act Q σ p).1)ᵀ * (act Q σ p).1) i j = (p.1ᵀ * p.1) (σ i) (σ j) := by
  have hQ : (Q : Matrix (Fin n) (Fin n) ℝ)ᵀ * (Q : Matrix (Fin n) (Fin n) ℝ) = 1 := by
    simpa [Matrix.star_eq_conjTranspose] using Matrix.UnitaryGroup.star_mul_self Q
  have h : ((act Q σ p).1)ᵀ * (act Q σ p).1
      = σ.permMatrix ℝ * (p.1ᵀ * p.1) * (σ⁻¹).permMatrix ℝ := by
    simp only [act, inv_permMatrix, Matrix.transpose_mul, Matrix.transpose_permMatrix, inv_inv]
    calc σ.permMatrix ℝ * (p.1ᵀ * (Q : Matrix (Fin n) (Fin n) ℝ)ᵀ)
          * ((Q : Matrix (Fin n) (Fin n) ℝ) * p.1 * (σ⁻¹).permMatrix ℝ)
        = σ.permMatrix ℝ * (p.1ᵀ * ((Q : Matrix (Fin n) (Fin n) ℝ)ᵀ * (Q : Matrix (Fin n) (Fin n) ℝ)) * p.1)
          * (σ⁻¹).permMatrix ℝ := by simp only [Matrix.mul_assoc]
      _ = _ := by rw [hQ, Matrix.mul_one]
  rw [h, Equiv.Perm.permMatrix, Equiv.Perm.permMatrix, PEquiv.mul_toMatrix_toPEquiv,
    PEquiv.toMatrix_toPEquiv_mul]
  simp [Equiv.Perm.inv_def]

/-- `R(Q W P⁻¹) = R(W)`: the penalty is invariant under the group. -/
theorem interference_act {n m : ℕ} (Q : Matrix.orthogonalGroup (Fin n) ℝ)
    (σ : Equiv.Perm (Fin m)) (p : Params n m) :
    interference (act Q σ p).1 = interference p.1 := by
  rw [interference_eq_gram, interference_eq_gram]
  simp only [gram_act]
  rw [← Equiv.sum_comp σ (fun i => ∑ j, if i = j then 0 else ((p.1ᵀ * p.1) i j) ^ 2)]
  refine Finset.sum_congr rfl fun i _ => ?_
  rw [← Equiv.sum_comp σ (fun j => if σ i = j then 0 else ((p.1ᵀ * p.1) (σ i) j) ^ 2)]
  simp

/-! ## The first step of issue #37, Section 1 -/

/-- Issue #37: for `0 ≤ a ≤ 1` and `g(x) = x − (a x + z)₊`, if `y ≤ x` then
`g(x) − g(y) ≥ (1 − a)(x − y)`. -/
theorem residual_increment {a z x y : ℝ} (ha0 : 0 ≤ a) (hxy : y ≤ x) :
    (1 - a) * (x - y) ≤ (x - max (a * x + z) 0) - (y - max (a * y + z) 0) := by
  have h : max (a * x + z) 0 - max (a * y + z) 0 ≤ a * (x - y) := by
    have hmul : a * y ≤ a * x := mul_le_mul_of_nonneg_left hxy ha0
    rcases le_total (a * x + z) 0 with hx | hx
    · rw [max_eq_right hx, max_eq_right (by linarith)]
      nlinarith [mul_nonneg ha0 (sub_nonneg.mpr hxy)]
    · rw [max_eq_left hx]
      have := le_max_left (a * y + z) 0
      linarith
  linarith

/-- The same, squared and without an order on `x` and `y`: this is the
pointwise inequality under issue #37's
`Var(g(X)) = ½ 𝔼(g(X) − g(X'))² ≥ (1 − a)² Var(X)`. It needs `a ≤ 1`. -/
theorem residual_increment_sq {a z : ℝ} (ha0 : 0 ≤ a) (ha1 : a ≤ 1) (x y : ℝ) :
    (1 - a) ^ 2 * (x - y) ^ 2 ≤
      ((x - max (a * x + z) 0) - (y - max (a * y + z) 0)) ^ 2 := by
  have key : ∀ x y : ℝ, y ≤ x → (1 - a) ^ 2 * (x - y) ^ 2 ≤
      ((x - max (a * x + z) 0) - (y - max (a * y + z) 0)) ^ 2 := by
    intro x y hxy
    have h1 := residual_increment (z := z) ha0 hxy
    have h2 : 0 ≤ (1 - a) * (x - y) := mul_nonneg (by linarith) (by linarith)
    calc (1 - a) ^ 2 * (x - y) ^ 2 = ((1 - a) * (x - y)) ^ 2 := by ring
      _ ≤ _ := pow_le_pow_left₀ h2 h1 2
  rcases le_total y x with h | h
  · exact key x y h
  · have := key y x h
    calc (1 - a) ^ 2 * (x - y) ^ 2 = (1 - a) ^ 2 * (y - x) ^ 2 := by ring
      _ ≤ _ := this
      _ = _ := by ring

/-- A continuous function is integrable against the coordinate law. -/
theorem integrable_coordLaw (S : ℝ) {f : ℝ → ℝ} (hf : Continuous f) :
    Integrable f (coordLaw S) := by
  have hd : Integrable f (ENNReal.ofReal S • Measure.dirac (0 : ℝ)) :=
    (integrable_dirac (by simp)).smul_measure ENNReal.ofReal_ne_top
  have hr : Integrable f (ENNReal.ofReal (1 - S) • volume.restrict (Set.Icc (0 : ℝ) 1)) :=
    Integrable.smul_measure (hf.continuousOn.integrableOn_compact isCompact_Icc)
      ENNReal.ofReal_ne_top
  exact hd.add_measure hr

/-- `𝔼 (c − f)² = c² − 2c 𝔼f + 𝔼f²` under a probability measure. -/
theorem integral_sq_sub {μ : Measure ℝ} [IsProbabilityMeasure μ] {f : ℝ → ℝ}
    (hf : Integrable f μ) (hf2 : Integrable (fun x => f x ^ 2) μ) (c : ℝ) :
    ∫ y, (c - f y) ^ 2 ∂μ = c ^ 2 - 2 * c * ∫ y, f y ∂μ + ∫ y, f y ^ 2 ∂μ := by
  have e : (fun y => (c - f y) ^ 2) = fun y => (c ^ 2 - 2 * c * f y) + f y ^ 2 := by
    funext y; ring
  have i1 : Integrable (fun y => c ^ 2 - 2 * c * f y) μ :=
    (integrable_const (c ^ 2)).sub (hf.const_mul (2 * c))
  have s1 : ∫ y, (c ^ 2 - 2 * c * f y) + f y ^ 2 ∂μ
      = ∫ y, (c ^ 2 - 2 * c * f y) ∂μ + ∫ y, f y ^ 2 ∂μ := integral_add i1 hf2
  have s2 : ∫ y, (c ^ 2 - 2 * c * f y) ∂μ = ∫ _y, c ^ 2 ∂μ - ∫ y, 2 * c * f y ∂μ :=
    integral_sub (integrable_const (c ^ 2)) (hf.const_mul (2 * c))
  rw [e, s1, s2, integral_const, integral_const_mul]
  simp

/-- `𝔼 (f² − 2 f A + B) = 𝔼f² − 2 (𝔼f) A + B` under a probability measure. -/
theorem integral_sq_expand {μ : Measure ℝ} [IsProbabilityMeasure μ] {f : ℝ → ℝ}
    (hf : Integrable f μ) (hf2 : Integrable (fun x => f x ^ 2) μ) (A B : ℝ) :
    ∫ x, (f x ^ 2 - 2 * f x * A + B) ∂μ
      = ∫ x, f x ^ 2 ∂μ - 2 * (∫ x, f x ∂μ) * A + B := by
  have i2 : Integrable (fun x => 2 * f x * A) μ := (hf.const_mul 2).mul_const A
  have i1 : Integrable (fun x => f x ^ 2 - 2 * f x * A) μ := hf2.sub i2
  have s1 : ∫ x, (f x ^ 2 - 2 * f x * A) + B ∂μ
      = ∫ x, (f x ^ 2 - 2 * f x * A) ∂μ + ∫ _x, B ∂μ := integral_add i1 (integrable_const B)
  have s2 : ∫ x, (f x ^ 2 - 2 * f x * A) ∂μ = ∫ x, f x ^ 2 ∂μ - ∫ x, 2 * f x * A ∂μ :=
    integral_sub hf2 i2
  rw [s1, s2, integral_mul_const, integral_const_mul, integral_const]
  simp

/-- Issue #37's device, `Var(h(X)) = ½ 𝔼 (h(X) − h(X'))²` for an independent
copy `X'`, used as a comparison: if the increments of `u` are pointwise no
larger in square than those of `w`, then `Var(u(X)) ≤ Var(w(X))`. The variance
is written `𝔼h² − (𝔼h)²`. -/
theorem variance_le_of_increment_sq {μ : Measure ℝ} [IsProbabilityMeasure μ] {u w : ℝ → ℝ}
    (hu : Integrable u μ) (hu2 : Integrable (fun x => u x ^ 2) μ)
    (hw : Integrable w μ) (hw2 : Integrable (fun x => w x ^ 2) μ)
    (h : ∀ x y, (u x - u y) ^ 2 ≤ (w x - w y) ^ 2) :
    ∫ x, u x ^ 2 ∂μ - (∫ x, u x ∂μ) ^ 2 ≤ ∫ x, w x ^ 2 ∂μ - (∫ x, w x ∂μ) ^ 2 := by
  have int_sq : ∀ {f : ℝ → ℝ}, Integrable f μ → Integrable (fun x => f x ^ 2) μ → ∀ c : ℝ,
      Integrable (fun y => (c - f y) ^ 2) μ := by
    intro f hf hf2 c
    have e : (fun y => (c - f y) ^ 2) = fun y => (c ^ 2 - 2 * c * f y) + f y ^ 2 := by
      funext y; ring
    rw [e]; exact ((integrable_const _).sub (hf.const_mul _)).add hf2
  have inner : ∀ x, u x ^ 2 - 2 * u x * ∫ y, u y ∂μ + ∫ y, u y ^ 2 ∂μ
      ≤ w x ^ 2 - 2 * w x * ∫ y, w y ∂μ + ∫ y, w y ^ 2 ∂μ := by
    intro x
    rw [← integral_sq_sub hu hu2, ← integral_sq_sub hw hw2]
    exact integral_mono (int_sq hu hu2 _) (int_sq hw hw2 _) (fun y => h x y)
  have outer := integral_mono
    ((hu2.sub ((hu.const_mul 2).mul_const (∫ y, u y ∂μ))).add
      (integrable_const (∫ y, u y ^ 2 ∂μ)))
    ((hw2.sub ((hw.const_mul 2).mul_const (∫ y, w y ∂μ))).add
      (integrable_const (∫ y, w y ^ 2 ∂μ))) inner
  simp only [Pi.add_apply, Pi.sub_apply] at outer
  rw [integral_sq_expand hu hu2, integral_sq_expand hw hw2] at outer
  nlinarith [outer]

/-- Issue #37, Section 1, the one-coordinate bound: for `0 ≤ a ≤ 1` and any
`z`, `𝔼 (X − (aX + z)₊)² ≥ (1 − a)² v`, with `X` drawn from the coordinate law
and `v = coordVar S`. "A second moment is at least the corresponding variance",
and the variance is compared with that of `(1 − a) X`. -/
theorem row_lower_bound {S a z : ℝ} (h0 : 0 ≤ S) (h1 : S ≤ 1) (ha0 : 0 ≤ a) (ha1 : a ≤ 1) :
    (1 - a) ^ 2 * coordVar S ≤ ∫ x, (x - max (a * x + z) 0) ^ 2 ∂(coordLaw S) := by
  have : IsProbabilityMeasure (coordLaw S) := ⟨coordLaw_univ h0 h1⟩
  have key := variance_le_of_increment_sq (μ := coordLaw S)
    (u := fun x => (1 - a) * x) (w := fun x => x - max (a * x + z) 0)
    (integrable_coordLaw S (by fun_prop)) (integrable_coordLaw S (by fun_prop))
    (integrable_coordLaw S (by fun_prop)) (integrable_coordLaw S (by fun_prop))
    (fun x y => by
      have := residual_increment_sq (z := z) ha0 ha1 x y
      calc ((1 - a) * x - (1 - a) * y) ^ 2 = (1 - a) ^ 2 * (x - y) ^ 2 := by ring
        _ ≤ _ := this)
  have e1 : ∫ x, ((1 - a) * x) ^ 2 ∂(coordLaw S) = (1 - a) ^ 2 * ((1 - S) / 3) := by
    have e : (fun x : ℝ => ((1 - a) * x) ^ 2) = fun x => (1 - a) ^ 2 * x ^ 2 := by
      funext x; ring
    rw [e, integral_const_mul, integral_coordLaw h0 h1 (f := fun x => x ^ 2) (by fun_prop),
      integral_pow]
    ring
  have e2 : ∫ x, (1 - a) * x ∂(coordLaw S) = (1 - a) * ((1 - S) / 2) := by
    rw [integral_const_mul, coordLaw_mean h0 h1]
  rw [e1, e2] at key
  have hv : (1 - a) ^ 2 * coordVar S
      = (1 - a) ^ 2 * ((1 - S) / 3) - ((1 - a) * ((1 - S) / 2)) ^ 2 := by
    rw [coordVar]; ring
  nlinarith [key, sq_nonneg (∫ x, (x - max (a * x + z) 0) ∂(coordLaw S))]

end IntegralAscent.MAIS.O47
