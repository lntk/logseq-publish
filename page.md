- Consider the setting $V_1, \dots, V_n \stackrel{iid}{\sim} \text{Exp}(a)$.
	- **Setup**
		- Since the scaling doesn't matter for the convergence, so we can assume $a = 1$.
		- Let $x_i(\alpha, V)=\mathbf{1}\left\{\alpha_i V_i \geq q_i\left(\alpha_{-i}, V_{-i}\right)\right\}$ be the allocation and $q_i\left(\alpha_{-i}, V_{-i}\right)=\max _{j \neq i} \{\alpha_j V_j\}$ be the second-price.
		- The spending map is
		  $$S_i(\alpha) := \mathbb{E}_{V \sim \text{Exp}(1)^{\otimes n}}[x_i(\alpha, V) \cdot q_{i}(\alpha_{-i}, V_{-i})] = \sum_{\varnothing \neq A \subseteq [n] \setminus \{i\}} (-1)^{|A| + 1} \frac{\sum_{j \in A} r_j}{(r_i + \sum_{j \in A} r_j)^2}, \quad r_j := \frac{1}{\alpha_j}.$$
		- For an interior equilibrium $\alpha^* \in (0, 1)^n$, define an instance $I(\alpha^*) = (V, S(\alpha^*))$ consisting of (values, budgets). Let $\mathcal{I}$ be the family of such instances.
	- **Algorithm**
		- $\alpha_i^{(t + 1)} = \text{BR}_i(\alpha^{(t)}_{-i}) := \max\{\alpha_i \in [0, 1] : S_i(\alpha_i, \alpha_{-i}^{(t)}) \le \rho_i\}$ is the best-response update.
		- Denote $T \equiv \widetilde{\text{BR}} : [0, 1]^n \to [0, 1]^n$. An equilibrium satisfies $\alpha^* = T(\alpha^*)$.
	- **Claim** : Let $J^* := J_T(\alpha^*)$ be the Jacobian of the best-response map at $\alpha^*$. We have
	  $$J^*_{ij} = - \frac{\partial_j S_i}{\partial_i S_i} \quad \text{for } j \neq i, \qquad J^*_{ii} = 0.$$