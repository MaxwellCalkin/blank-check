import Mathlib

/-!
# MAIS-O47, part (2): the statement, and the claim of MAIS issue #37

Statement layer only. Nothing here is proved, nothing is assumed, and there is
no `sorry` and no axiom: every item is a definition, and defining a proposition
asserts nothing about its truth.

Sources, read on 2026-11-21:

* the problem page, `open-problems/MAIS-O47.md` in Math-for-AI-Safety/MAIS;
* the agenda, `agendas/A4/MAIS-A4.tex`: Definition "Sparse feature
  distribution", Definition "The ReLU toy model", Definition "Coherence and
  interference", and Problem 5.7 with the paragraph before it;
* MAIS issue #37, a candidate solution to part (2), by another author.

The definitions follow the agenda, not the issue's summary of it. Where a
choice had to be made that print does not make, the docstring says so.

Written by an AI agent (Claude). No person has reviewed it.
-/

namespace IntegralAscent.MAIS.O47

open MeasureTheory Matrix

/-! ## The data -/

/-- Print (A4, "Sparse feature distribution"): a coordinate is `0` with
probability `S` and `Uniform[0,1]` with probability `1 - S`.

As a measure on `ℝ`: `S • δ₀ + (1 - S) • (Lebesgue restricted to [0,1])`.
`ENNReal.ofReal` sends negative reals to `0`, so outside `0 ≤ S ≤ 1` this is not
the printed law; every statement below fixes `S` or assumes `0 ≤ S < 1`, which
is print's own range `S ∈ [0,1)`. -/
noncomputable def coordLaw (S : ℝ) : Measure ℝ :=
  ENNReal.ofReal S • Measure.dirac 0 +
    ENNReal.ofReal (1 - S) • (volume.restrict (Set.Icc (0 : ℝ) 1))

/-- Print: the law `𝒟_{m,S}` of `x ∈ ℝᵐ` "whose coordinates are independent",
each with the coordinate law. Independence is the product measure. -/
noncomputable def dataLaw (m : ℕ) (S : ℝ) : Measure (Fin m → ℝ) :=
  Measure.pi fun _ => coordLaw S

/-! ## The model -/

/-- Print: "a matrix `W ∈ ℝ^{n×m}` … and a vector `b ∈ ℝᵐ`". -/
abbrev Params (n m : ℕ) : Type := Matrix (Fin n) (Fin m) ℝ × (Fin m → ℝ)

/-- Print: `f_{W,b}(x) = ReLU(WᵀW x + b) ∈ ℝᵐ`, the rectifier taken
coordinatewise. -/
noncomputable def network {n m : ℕ} (p : Params n m) (x : Fin m → ℝ) : Fin m → ℝ :=
  fun i => max (((p.1ᵀ * p.1) *ᵥ x + p.2) i) 0

/-- Print: the task loss `L_{m,n,S}(W,b) = 𝔼_{x∼𝒟} ‖x − f_{W,b}(x)‖₂²`.

The squared Euclidean norm is written out as a sum of squares, so no choice of
norm on `Fin m → ℝ` enters. The expectation is a Bochner integral, which
returns `0` on a non-integrable function; the integrand here is continuous and
the law is supported on the compact cube `[0,1]ᵐ`, so that branch should never
be taken. That is stated here and not proved here. -/
noncomputable def taskLoss {n m : ℕ} (S : ℝ) (p : Params n m) : ℝ :=
  ∫ x, ∑ i, (x i - network p x i) ^ 2 ∂(dataLaw m S)

/-- Print (A4, "Coherence and interference", and the O47 page):
`R(W) = ∑_{i≠j} ⟨W_i, W_j⟩²`, where `W_i` is the `i`-th column.

The sum is over ordered pairs, as `∑_{i≠j}` reads and as issue #37 takes it, so
each unordered pair is counted twice. The choice matters to the claim: it sets
the scale of `λ`. -/
noncomputable def interference {n m : ℕ} (W : Matrix (Fin n) (Fin m) ℝ) : ℝ :=
  ∑ i, ∑ j, if i = j then 0 else (W.col i ⬝ᵥ W.col j) ^ 2

/-- Print: the objective `L + λR`. At `λ = 0` this is `L`, up to `0 * R`. -/
noncomputable def objective {n m : ℕ} (S lam : ℝ) (p : Params n m) : ℝ :=
  taskLoss S p + lam * interference p.1

/-! ## The symmetry group and identifiability -/

/-- Print: `G = O(n) × Σ_m` acts by `W ↦ Q W P⁻¹`, `b ↦ P b`, "for `Q`
orthogonal and `P` a coordinate permutation (permuting features and their
biases together)".

`P` is Mathlib's permutation matrix of `σ`. Mathlib's convention makes
`(P b) i = b (σ i)`; the other convention gives the action of `σ⁻¹`. Every
statement below quantifies over all `σ`, so the orbits are the same either way.
`P⁻¹` is the true inverse: a permutation matrix is invertible. -/
noncomputable def act {n m : ℕ} (Q : Matrix.orthogonalGroup (Fin n) ℝ)
    (σ : Equiv.Perm (Fin m)) (p : Params n m) : Params n m :=
  ((Q : Matrix (Fin n) (Fin n) ℝ) * p.1 * (σ.permMatrix ℝ)⁻¹, (σ.permMatrix ℝ) *ᵥ p.2)

/-- `q` lies in the `G`-orbit of `p`. -/
def InOrbit {n m : ℕ} (p q : Params n m) : Prop :=
  ∃ (Q : Matrix.orthogonalGroup (Fin n) ℝ) (σ : Equiv.Perm (Fin m)), q = act Q σ p

/-- The `argmin` of the objective over all parameters. -/
def argminSet {n m : ℕ} (S lam : ℝ) : Set (Params n m) :=
  {p | ∀ q : Params n m, objective S lam p ≤ objective S lam q}

/-- Print (Problem 5.7): "Call the objective `L + λR` identifiable at
`(m,n,S,λ)` if its argmin is nonempty and consists of a single `G`-orbit."

Read literally: the argmin *is* one orbit. An orbit is nonempty, so
nonemptiness is included. This does not use the fact that the objective is
`G`-invariant, which print asserts and nothing here proves. -/
def Identifiable (n m : ℕ) (S lam : ℝ) : Prop :=
  ∃ p : Params n m, argminSet S lam = {q | InOrbit p q}

/-! ## Part (2) as print poses it -/

/-- Print, part (2), first branch: "Exhibit `(m,n,S,λ)` with `λ > 0` such that
`L + λR` is identifiable while `L` is not".

The side conditions are print's and no others: `n < m` from "Fix integers
`n < m`", and `S ∈ [0,1)`. Print does not write `n ≥ 1`. Issue #37 does. At
`n = 0` the matrix `W` is empty, so the case is admitted here as print admits
it; issue #37's witness has `n = 1` and does not depend on it.

"`L` is not identifiable" is the negation of the definition, so it holds if the
argmin of `L` is empty as well as if it is more than one orbit. -/
def PartTwoWitnessExists : Prop :=
  ∃ (n m : ℕ) (S lam : ℝ), n < m ∧ 0 ≤ S ∧ S < 1 ∧ 0 < lam ∧
    Identifiable n m S lam ∧ ¬ Identifiable n m S 0

/-- Print, part (2), second branch: "regularization by `R` never creates
identifiability where it was absent". Stated as the negation of the first. -/
def PartTwoNeverCreates : Prop := ¬ PartTwoWitnessExists

/-! ## What issue #37 claims -/

/-- Issue #37's variance of one coordinate, `v = (1 − S)(1 + 3S)/12`. -/
noncomputable def coordVar (S : ℝ) : ℝ := (1 - S) * (1 + 3 * S) / 12

/-- Issue #37, Section 1, first display: for every `m > n ≥ 1` and
`S ∈ [0,1)`, `L(W,b) + v R(W) ≥ (m − n) v`. -/
def Issue37LowerBound : Prop :=
  ∀ (n m : ℕ) (S : ℝ), 1 ≤ n → n < m → 0 ≤ S → S < 1 →
    ∀ p : Params n m,
      ((m : ℝ) - n) * coordVar S ≤ taskLoss S p + coordVar S * interference p.1

/-- Issue #37, Section 1, the theorem: for every `λ > v` the objective attains
its minimum, the minimisers are one `G`-orbit, and the minimum is `(m − n) v`.

The issue also names a representative (`n` orthonormal columns, `m − n` zero
columns, bias `0` on stored coordinates and `(1 − S)/2` on dropped ones). That
is not stated here; it is what a proof would exhibit. -/
def Issue37StrongRegularisation : Prop :=
  ∀ (n m : ℕ) (S lam : ℝ), 1 ≤ n → n < m → 0 ≤ S → S < 1 → coordVar S < lam →
    Identifiable n m S lam ∧
      ∀ p ∈ argminSet (n := n) (m := m) S lam, objective S lam p = ((m : ℝ) - n) * coordVar S

/-- Issue #37, Section 2: at `(m,n,S) = (2,1,0)` the unregularised loss attains
its minimum, and two of its minimisers lie in different `G`-orbits.

This is stronger than "`L` is not identifiable": it rules out the empty
argmin. -/
def Issue37UnregularisedTwoOrbits : Prop :=
  ∃ p ∈ argminSet (n := 1) (m := 2) 0 0, ∃ q ∈ argminSet (n := 1) (m := 2) 0 0,
    ¬ InOrbit p q

/-- Issue #37, the boxed claim: `(m,n,S,λ) = (2,1,0,1/6)` is a witness for
part (2). -/
def Issue37Witness : Prop :=
  Identifiable 1 2 0 (1 / 6) ∧ ¬ Identifiable 1 2 0 0

end IntegralAscent.MAIS.O47
