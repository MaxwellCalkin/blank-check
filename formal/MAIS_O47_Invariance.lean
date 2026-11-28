import Mathlib
import MAIS_O47

/-!
# MAIS-O47: the objective is unchanged by the symmetry group

The agenda says that the objective `L + λR` is invariant under
`G = O(n) × Σ_m`, acting by `W ↦ Q W P⁻¹`, `b ↦ P b`. The docstring of
`Identifiable` in `MAIS_O47.lean` notes that nothing there proves it. This file
proves it for the action `act` exactly as defined there:

* `gram_act`: the Gram matrix of `Q W P⁻¹` is the Gram matrix of `W` with rows
  and columns permuted by `σ`;
* `network_act`: the network of the moved parameters is the network of the old
  ones, read on the permuted input and permuted back;
* `integral_comp_perm`: the data law is unchanged by permuting coordinates;
* `taskLoss_act`, `interference_act`, `objective_act`: the three quantities are
  unchanged, for every `S`, `λ`, `Q` and `σ`;
* `act_mem_argminSet`, `inOrbit_subset_argminSet`: so every point in the orbit
  of a minimiser is a minimiser. This is one inclusion of the orbit claim in
  `Issue37StrongRegularisation`; the other needs the equality cases of the
  lower bound and is not proved here.

Nothing here assumes `0 ≤ S ≤ 1`: the data law is a product of one law, so any
permutation of coordinates preserves it, whatever that law is.

Written by an AI agent (Claude). No person has reviewed it.
-/

namespace IntegralAscent.MAIS.O47

open MeasureTheory Matrix

/-- The inverse of a permutation matrix is the matrix of the inverse. -/
theorem permMatrix_inv {m : ℕ} (σ : Equiv.Perm (Fin m)) :
    (σ.permMatrix ℝ)⁻¹ = (σ⁻¹).permMatrix ℝ := by
  apply Matrix.inv_eq_left_inv
  rw [← Matrix.permMatrix_mul, mul_inv_cancel, Matrix.permMatrix_one]

/-- The moved weight matrix: `Q W P⁻¹ = Q · (W with columns permuted by σ)`. -/
theorem act_fst {n m : ℕ} (Q : Matrix.orthogonalGroup (Fin n) ℝ)
    (σ : Equiv.Perm (Fin m)) (p : Params n m) :
    (act Q σ p).1 = (Q : Matrix (Fin n) (Fin n) ℝ) * p.1.submatrix id σ := by
  simp only [act, permMatrix_inv, Matrix.mul_assoc]
  congr 1
  rw [Equiv.Perm.permMatrix, PEquiv.mul_toMatrix_toPEquiv]
  rfl

theorem act_snd {n m : ℕ} (Q : Matrix.orthogonalGroup (Fin n) ℝ)
    (σ : Equiv.Perm (Fin m)) (p : Params n m) :
    (act Q σ p).2 = p.2 ∘ σ := by
  simp only [act, Equiv.Perm.permMatrix, PEquiv.toMatrix_toPEquiv_mulVec]

/-- The Gram matrix of the moved weights. -/
theorem gram_act {n m : ℕ} (Q : Matrix.orthogonalGroup (Fin n) ℝ)
    (σ : Equiv.Perm (Fin m)) (p : Params n m) :
    (act Q σ p).1ᵀ * (act Q σ p).1 = (p.1ᵀ * p.1).submatrix σ σ := by
  have hQ : (Q : Matrix (Fin n) (Fin n) ℝ)ᵀ * Q = 1 :=
    (Matrix.mem_orthogonalGroup_iff' (Fin n) ℝ).mp Q.2
  rw [act_fst, Matrix.transpose_mul, Matrix.mul_assoc, ← Matrix.mul_assoc ((Q : Matrix (Fin n) (Fin n) ℝ)ᵀ) (Q : Matrix (Fin n) (Fin n) ℝ),
    hQ, Matrix.one_mul]
  ext i j
  simp [Matrix.mul_apply]

/-- The network of the moved parameters. -/
theorem network_act {n m : ℕ} (Q : Matrix.orthogonalGroup (Fin n) ℝ)
    (σ : Equiv.Perm (Fin m)) (p : Params n m) (x : Fin m → ℝ) (i : Fin m) :
    network (act Q σ p) x i = network p (x ∘ σ.symm) (σ i) := by
  simp only [network, gram_act, act_snd, Matrix.submatrix_mulVec_equiv]
  rfl

/-- The data law is unchanged by permuting coordinates. -/
theorem integral_comp_perm (m : ℕ) (S : ℝ) (τ : Equiv.Perm (Fin m))
    (g : (Fin m → ℝ) → ℝ) :
    ∫ x, g (x ∘ τ) ∂(dataLaw m S) = ∫ x, g x ∂(dataLaw m S) := by
  have : IsFiniteMeasure (coordLaw S) :=
    ⟨by simp [coordLaw, Real.volume_Icc, ENNReal.add_lt_top]⟩
  have h := measurePreserving_piCongrLeft (fun _ : Fin m => coordLaw S) τ.symm
  have hfun : ⇑(MeasurableEquiv.piCongrLeft (fun _ : Fin m => ℝ) τ.symm) =
      fun x : Fin m → ℝ => x ∘ τ := by
    funext x a
    simp [MeasurableEquiv.coe_piCongrLeft, Equiv.piCongrLeft_apply]
  have h' := h.integral_comp' g
  rw [hfun] at h'
  exact h'

/-- The task loss is unchanged by the group, for every `S`. -/
theorem taskLoss_act {n m : ℕ} (S : ℝ) (Q : Matrix.orthogonalGroup (Fin n) ℝ)
    (σ : Equiv.Perm (Fin m)) (p : Params n m) :
    taskLoss S (act Q σ p) = taskLoss S p := by
  unfold taskLoss
  let g : (Fin m → ℝ) → ℝ := fun y => ∑ i, (y i - network p y i) ^ 2
  have hpt : ∀ x : Fin m → ℝ,
      ∑ i, (x i - network (act Q σ p) x i) ^ 2 = g (x ∘ σ.symm) := by
    intro x
    simp only [network_act, g]
    rw [← Equiv.sum_comp σ (fun j => ((x ∘ σ.symm) j - network p (x ∘ σ.symm) j) ^ 2)]
    simp [Function.comp]
  calc ∫ x, ∑ i, (x i - network (act Q σ p) x i) ^ 2 ∂(dataLaw m S)
      = ∫ x, g (x ∘ σ.symm) ∂(dataLaw m S) := by
        congr 1; funext x; exact hpt x
    _ = ∫ x, g x ∂(dataLaw m S) := integral_comp_perm m S σ.symm g

/-- The penalty is unchanged by the group. -/
theorem interference_act {n m : ℕ} (Q : Matrix.orthogonalGroup (Fin n) ℝ)
    (σ : Equiv.Perm (Fin m)) (p : Params n m) :
    interference (act Q σ p).1 = interference p.1 := by
  have hdot : ∀ (W : Matrix (Fin n) (Fin m) ℝ) (i j : Fin m),
      W.col i ⬝ᵥ W.col j = (Wᵀ * W) i j := by
    intro W i j
    simp [Matrix.mul_apply, dotProduct]
  unfold interference
  simp only [hdot, gram_act, Matrix.submatrix_apply]
  rw [← Equiv.sum_comp σ (fun i => ∑ j, if i = j then 0 else ((p.1ᵀ * p.1) i j) ^ 2)]
  refine Finset.sum_congr rfl fun i _ => ?_
  rw [← Equiv.sum_comp σ (fun j => if σ i = j then 0 else ((p.1ᵀ * p.1) (σ i) j) ^ 2)]
  refine Finset.sum_congr rfl fun j _ => ?_
  simp [σ.injective.eq_iff]

/-- The objective `L + λR` is unchanged by the group, for every `S` and `λ`. -/
theorem objective_act {n m : ℕ} (S lam : ℝ) (Q : Matrix.orthogonalGroup (Fin n) ℝ)
    (σ : Equiv.Perm (Fin m)) (p : Params n m) :
    objective S lam (act Q σ p) = objective S lam p := by
  simp only [objective, taskLoss_act, interference_act]

/-- Moving a minimiser by the group gives a minimiser. -/
theorem act_mem_argminSet {n m : ℕ} {S lam : ℝ} (Q : Matrix.orthogonalGroup (Fin n) ℝ)
    (σ : Equiv.Perm (Fin m)) {p : Params n m} (hp : p ∈ argminSet S lam) :
    act Q σ p ∈ argminSet S lam := by
  intro q
  rw [objective_act]
  exact hp q

/-- The orbit of a minimiser lies in the argmin: one inclusion of
"the argmin is a single orbit". -/
theorem inOrbit_subset_argminSet {n m : ℕ} {S lam : ℝ} {p : Params n m}
    (hp : p ∈ argminSet S lam) : {q | InOrbit p q} ⊆ argminSet S lam := by
  rintro q ⟨Q, σ, rfl⟩
  exact act_mem_argminSet Q σ hp

#print axioms objective_act
#print axioms inOrbit_subset_argminSet

end IntegralAscent.MAIS.O47
