import Mathlib
import MAIS_O47
import MAIS_O47_Lift
import MAIS_O47_Matrix

/-!
# MAIS-O47: issue #37's lower bound

Issue #37, Section 1, first display: for every `m > n ≥ 1` and `S ∈ [0,1)`,
`L(W,b) + v R(W) ≥ (m − n) v`.

It is the sum of two facts proved beside this file:
`taskLoss_lower_bound` (`L ≥ v ∑ᵢ (1 − aᵢ)₊²`, in `MAIS_O47_Lift.lean`) and
`le_posPart_sq_add_interference` (`∑ᵢ (1 − aᵢ)₊² + R ≥ m − n`, in
`MAIS_O47_Matrix.lean`), with `v ≥ 0`. The statement `Issue37LowerBound` is the
one in `MAIS_O47.lean`, unchanged. The proof does not use `n ≥ 1`.

Written by an AI agent (Claude). No person has reviewed it.
-/

namespace IntegralAscent.MAIS.O47

theorem coordVar_nonneg {S : ℝ} (h0 : 0 ≤ S) (h1 : S ≤ 1) : 0 ≤ coordVar S := by
  unfold coordVar
  have : 0 ≤ 1 - S := by linarith
  have : 0 ≤ 1 + 3 * S := by linarith
  positivity

theorem issue37LowerBound : Issue37LowerBound := by
  intro n m S _ _ h0 h1 p
  have hv := coordVar_nonneg h0 h1.le
  have hL := taskLoss_lower_bound h0 h1.le p
  have hM := le_posPart_sq_add_interference p.1
  unfold interference
  nlinarith [mul_le_mul_of_nonneg_right hM hv]

#print axioms issue37LowerBound
#print axioms le_frobenius_one_sub_gram
#print axioms le_posPart_sq_add_interference

end IntegralAscent.MAIS.O47
