import Mathlib

/-!
# MAIS-O47: the matrix step

Issue #37, Section 1, third step: for a Gram matrix `H = WᵀW` of an `n × m`
matrix `W`, `‖I − H‖_F² ≥ m − n`.

The proof does not use eigenvalues. The kernel `K` of `W` has dimension at
least `m − n`, and `I − WᵀW` fixes every vector of `K`. An orthonormal basis of
`K` extends to one of `ℝᵐ`, and the squared Frobenius norm of a matrix `A` is
`∑ₖ ‖A uₖ‖²` over any orthonormal basis `u`, because both equal the trace of
`AᵀA`. The vectors of `K` in the basis contribute `1` each.

Written by an AI agent (Claude). No person has reviewed it.
-/

open Matrix Module

namespace IntegralAscent.MAIS.O47

/-- The squared Frobenius norm of a square matrix is `∑ₖ ‖A uₖ‖²` over any
orthonormal basis `u` of Euclidean space. -/
theorem sum_norm_sq_toEuclideanLin {m : ℕ} {ι : Type*} [Fintype ι]
    (A : Matrix (Fin m) (Fin m) ℝ) (b : OrthonormalBasis ι ℝ (EuclideanSpace ℝ (Fin m))) :
    ∑ k, ‖Matrix.toEuclideanLin A (b k)‖ ^ 2 = ∑ i, ∑ j, (A i j) ^ 2 := by
  classical
  set L := Matrix.toEuclideanLin A
  have h1 : ∀ x, ‖L x‖ ^ 2 = inner ℝ x ((LinearMap.adjoint L ∘ₗ L) x) := by
    intro x
    rw [LinearMap.comp_apply, LinearMap.adjoint_inner_right, real_inner_self_eq_norm_sq]
  simp_rw [h1]
  rw [← LinearMap.trace_eq_sum_inner,
    LinearMap.trace_eq_sum_inner _ (EuclideanSpace.basisFun (Fin m) ℝ)]
  simp_rw [← h1]
  rw [Finset.sum_comm]
  refine Finset.sum_congr rfl fun j _ => ?_
  rw [EuclideanSpace.norm_sq_eq]
  refine Finset.sum_congr rfl fun i _ => ?_
  simp [L, Matrix.toLpLin_apply, Matrix.mulVec_single]

/-- The matrix step: `m − n ≤ ‖I − WᵀW‖_F²` for every `n × m` matrix `W`. -/
theorem le_frobenius_one_sub_gram {n m : ℕ} (W : Matrix (Fin n) (Fin m) ℝ) :
    (m : ℝ) - n ≤ ∑ i, ∑ j, ((1 - Wᵀ * W : Matrix (Fin m) (Fin m) ℝ) i j) ^ 2 := by
  classical
  set A : Matrix (Fin m) (Fin m) ℝ := 1 - Wᵀ * W
  set L := Matrix.toEuclideanLin A
  set K := LinearMap.ker (Matrix.toEuclideanLin W)
  -- `I − WᵀW` fixes the kernel of `W`.
  have hfix : ∀ x ∈ K, L x = x := by
    intro x hx
    have hW : W *ᵥ (WithLp.ofLp x) = 0 := by
      have := congrArg WithLp.ofLp (LinearMap.mem_ker.mp hx)
      simpa [Matrix.toLpLin_apply] using this
    ext i
    simp [L, A, Matrix.toLpLin_apply, hW]
  -- The kernel has dimension at least `m − n`.
  set d := finrank ℝ K
  have hd : m ≤ n + d := by
    have h := LinearMap.finrank_range_add_finrank_ker (Matrix.toEuclideanLin W)
    have hr := Submodule.finrank_le (LinearMap.range (Matrix.toEuclideanLin W))
    change _ + d = _ at h
    simp only [finrank_euclideanSpace_fin] at h hr
    omega
  -- An orthonormal basis of the kernel, extended to all of `ℝᵐ`.
  set bK := stdOrthonormalBasis ℝ K
  have hcard : Fintype.card (Fin (finrank ℝ K)) = d := by simp [d]
  let v : Fin (finrank ℝ K) → EuclideanSpace ℝ (Fin m) := fun k => (bK k : EuclideanSpace ℝ (Fin m))
  have hv : Orthonormal ℝ v := bK.orthonormal.comp_linearIsometry K.subtypeₗᵢ
  have hvinj : Function.Injective v := hv.linearIndependent.injective
  have hvr : Orthonormal ℝ ((↑) : Set.range v → EuclideanSpace ℝ (Fin m)) :=
    (orthonormal_subtype_range hvinj).mpr hv
  obtain ⟨u, b, hvu, hb⟩ := hvr.exists_orthonormalBasis_extension
  have hsum := sum_norm_sq_toEuclideanLin A b
  rw [hb] at hsum
  rw [← hsum, Finset.sum_coe_sort u (fun x => ‖L x‖ ^ 2)]
  have himg : Finset.univ.image v ⊆ u := by
    intro x hx
    obtain ⟨k, -, rfl⟩ := Finset.mem_image.mp hx
    exact hvu ⟨k, rfl⟩
  calc (m : ℝ) - n ≤ d := by
        have : (m : ℝ) ≤ n + d := by exact_mod_cast hd
        linarith
    _ = ∑ k, ‖L (v k)‖ ^ 2 := by
        rw [Finset.sum_congr rfl fun k _ => by rw [hfix (v k) (bK k).2, hv.1 k]]
        simp [hcard]
    _ = ∑ x ∈ Finset.univ.image v, ‖L x‖ ^ 2 := by
        rw [Finset.sum_image fun a _ b _ h => hvinj h]
    _ ≤ ∑ x ∈ u, ‖L x‖ ^ 2 :=
        Finset.sum_le_sum_of_subset_of_nonneg himg fun _ _ _ => by positivity

/-- An entry of the Gram matrix is the dot product of two columns. -/
theorem gram_apply {n m : ℕ} (W : Matrix (Fin n) (Fin m) ℝ) (i j : Fin m) :
    (Wᵀ * W) i j = W.col i ⬝ᵥ W.col j := by
  simp [Matrix.mul_apply, dotProduct]

/-- The shortening factor of issue #37: `1` for a column of squared length at
most `1`, and `1/‖Wᵢ‖` for a longer one. -/
noncomputable def shorten (a : ℝ) : ℝ := if a ≤ 1 then 1 else 1 / Real.sqrt a

/-- The matrix step in the form issue #37 uses it, with shortened columns:
`m − n ≤ ∑ᵢ (1 − aᵢ)₊² + ∑_{i≠j} ⟨Wᵢ, Wⱼ⟩²`, where `aᵢ = (WᵀW)ᵢᵢ`.

Columns longer than `1` are scaled to length `1`. That makes their diagonal
term `0`, which is what `(1 − aᵢ)₊` gives them, and shrinks every
off-diagonal term. The scaled matrix is still `n × m`, so the matrix step
applies to it. -/
theorem le_posPart_sq_add_interference {n m : ℕ} (W : Matrix (Fin n) (Fin m) ℝ) :
    (m : ℝ) - n ≤ ∑ i, (max (1 - (Wᵀ * W) i i) 0) ^ 2 +
      ∑ i, ∑ j, if i = j then 0 else (W.col i ⬝ᵥ W.col j) ^ 2 := by
  classical
  set d : Fin m → ℝ := fun i => shorten ((Wᵀ * W) i i)
  have hGii : ∀ i, 0 ≤ (Wᵀ * W) i i := fun i => by
    rw [gram_apply]; exact Finset.sum_nonneg fun k _ => mul_self_nonneg _
  have hd0 : ∀ i, 0 ≤ d i := fun i => by
    simp only [d, shorten]; split_ifs <;> positivity
  have hd1 : ∀ i, d i ≤ 1 := fun i => by
    simp only [d, shorten]
    split_ifs with h
    · exact le_rfl
    · replace h := not_le.mp h
      rw [div_le_one (Real.sqrt_pos.mpr (by linarith))]
      exact ((Real.lt_sqrt zero_le_one).mpr (by nlinarith)).le

  have hV : ∀ i j, ((W * Matrix.diagonal d)ᵀ * (W * Matrix.diagonal d)) i j = d i * (Wᵀ * W) i j * d j := by
    intro i j
    simp only [Matrix.transpose_mul, Matrix.diagonal_transpose]
    rw [show Matrix.diagonal d * Wᵀ * (W * Matrix.diagonal d)
        = Matrix.diagonal d * (Wᵀ * W) * Matrix.diagonal d by
      simp only [Matrix.mul_assoc]]
    simp [Matrix.diagonal_mul, Matrix.mul_diagonal]
  have hentry : ∀ i j, ((1 - (W * Matrix.diagonal d)ᵀ * (W * Matrix.diagonal d) : Matrix (Fin m) (Fin m) ℝ) i j) ^ 2 ≤
      (if i = j then (max (1 - (Wᵀ * W) i i) 0) ^ 2 else 0) +
        (if i = j then 0 else (W.col i ⬝ᵥ W.col j) ^ 2) := by
    intro i j
    rw [Matrix.sub_apply, hV]
    by_cases hij : i = j
    · subst hij
      simp only [Matrix.one_apply_eq, if_true, add_zero]
      by_cases ha : (Wᵀ * W) i i ≤ 1
      · have : d i = 1 := by simp [d, shorten, ha]
        rw [this, max_eq_left (by linarith)]
        ring_nf; exact le_rfl
      · replace ha := not_le.mp ha
        have hs : Real.sqrt ((Wᵀ * W) i i) ^ 2 = (Wᵀ * W) i i := Real.sq_sqrt (hGii i)
        have hsp : 0 < Real.sqrt ((Wᵀ * W) i i) := Real.sqrt_pos.mpr (by linarith)
        have : d i * (Wᵀ * W) i i * d i = 1 := by
          simp only [d, shorten, if_neg (not_le.mpr ha)]
          field_simp
          linarith [hs]
        rw [this]; simp
    · simp only [Matrix.one_apply_ne hij, if_neg hij, zero_add, zero_sub, neg_sq]
      rw [← gram_apply]
      have h1 : (d i * d j) ^ 2 ≤ 1 := by
        have := mul_le_one₀ (hd1 i) (hd0 j) (hd1 j)
        nlinarith [mul_nonneg (hd0 i) (hd0 j)]
      nlinarith [sq_nonneg ((Wᵀ * W) i j)]
  calc (m : ℝ) - n ≤ ∑ i, ∑ j, ((1 - (W * Matrix.diagonal d)ᵀ * (W * Matrix.diagonal d) : Matrix (Fin m) (Fin m) ℝ) i j) ^ 2 :=
        le_frobenius_one_sub_gram (W * Matrix.diagonal d)
    _ ≤ ∑ i, ∑ j, ((if i = j then (max (1 - (Wᵀ * W) i i) 0) ^ 2 else 0) +
          (if i = j then 0 else (W.col i ⬝ᵥ W.col j) ^ 2)) :=
        Finset.sum_le_sum fun i _ => Finset.sum_le_sum fun j _ => hentry i j
    _ = _ := by
        simp only [Finset.sum_add_distrib, Finset.sum_ite_eq, Finset.mem_univ, if_true]

end IntegralAscent.MAIS.O47
