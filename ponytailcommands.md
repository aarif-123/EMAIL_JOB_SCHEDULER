You can use the **Ponytail** skills directly in your prompts by using natural language triggers or slash commands.

---

### 1. Core Coding Mode (`ponytail`)
Forces the shortest, simplest, and most maintainable solution without unnecessary dependencies or boilerplate (YAGNI + standard library first).

* **Default / Full Mode**:
  > *"Write a function to parse URLs (be lazy / use ponytail)."*  
  > *"Add a date picker to the form using ponytail."*
* **Lite Mode** (Builds what's asked, but points out the simpler stdlib alternative in one line):
  > *"`/ponytail lite` Create an in-memory cache for user sessions."*
* **Ultra Mode** (Aggressive YAGNI & deletion first):
  > *"`/ponytail ultra` Refactor this service layer."*
* **Disable / Revert**:
  > *"Stop ponytail"* or *"Normal mode"*

---

### 2. Codebase Bloat Audit (`ponytail-audit`)
Scans the repository for over-engineered patterns, redundant dependencies, and unnecessary abstractions.

* **Example prompts**:
  > *"Audit this codebase for over-engineering."*  
  > *"What can I delete from this repository?"*  
  > *"`/ponytail-audit`"*

---

### 3. Review for Over-Engineering (`ponytail-review`)
Reviews staged changes or specific files and points out reinvented wheels or speculative code.

* **Example prompts**:
  > *"Review my recent changes for over-engineering."*  
  > *"Review `auth.py` with ponytail."*  
  > *"`/ponytail-review`"*

---

### 4. Technical Debt Ledger (`ponytail-debt`)
Finds all deliberate shortcuts marked with `# ponytail:` / `// ponytail:` comments and compiles them into a debt tracking list.

* **Example prompts**:
  > *"List all ponytail debt and deferred shortcuts."*  
  > *"`/ponytail-debt`"*

---

### 5. Quick Reference & Help (`ponytail-help` & `ponytail-gain`)
* **Reference Guide**: `ponytail help` or `/ponytail-help`
* **Scoreboard / Benchmark Impact**: `ponytail gain` or `/ponytail-gain`

Ran command: `/ponytail-review`
Ran command: `cls`