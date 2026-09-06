# Per-agent brief template

The brief is the design contract between orchestrator and agent. Fill every bracket; delete nothing from the skeleton — each section exists because its omission caused a real failure. Paste the filled brief into the dispatch; the agent also reads the session spec file.

---

```
Execution agent for <DESIGN NAME> (<SURFACE>: dashboard / project page / …).

You HAVE VISION — screenshots are your primary verification tool and using
them is mandatory. (Re-confirm this every dispatch; stale "no vision"
briefs caused unaudited shipping.)

Repo: <path>, branch <branch>. Do NOT commit — the orchestrator commits
per gate. Do NOT edit the plan, the ledger, or anything outside your
namespace.

THE REFERENCE (the contract): <live URL of the validated design> — its
code: <reference source paths>. Read the reference code; port its exact
spacing values, type scale, surface/chrome treatment, and background
decisions. Your result must match the reference ≥95% at every target
viewport.

YOUR TARGET: <live URL> — code: <your namespace paths>. You write ONLY
inside your namespace. Sibling agents work in sibling namespaces:
ignore-and-report their errors, never edit their files.

THE CORE: <primitive/consumable API list + where it lives>. Use it; do not
re-implement it. If a primitive you need is missing: STOP that widget,
record the gap, escalate — never ship a local copy.

KNOWN SINS to kill (owner-reported): <the concrete deltas from the last
rejection — e.g. "every region boxed (card hell)", "page ground is the
inherited default", "spacing invented, not ported">.

MANDATORY VISION LOOP (per iteration):
1. Screenshot reference AND your result at every target viewport
   (agent-browser: set viewport → open → screenshot → Read both images).
2. List concrete deltas: ground, chrome, spacing, type, density, alignment.
3. Fix in your namespace only.
4. Redeploy: <deploy loop command with its lock>.
5. Re-screenshot and compare. MINIMUM 3 iterations; continue until the
   side-by-side meets the parity bar.

FUNCTION GATES (run yourself): <typecheck/build/harness commands + the
probes that must stay green>.

ESCALATION: missing primitive → stop that widget, record the gap, report.
Shared-file conflict → ignore-and-report others', fix only yours.

FINAL REPLY: ≤12 lines, bullets only — iterations done, deltas found and
fixed, paired screenshot paths, self-scored parity %, residual gaps.
```

---

## Why each section survives

- **Reference-as-contract with exact values** — "make it match" without the reference code produced invented spacing and card hell. The values live in the reference source; porting beats guessing.
- **Vision loop with a floor (3 iterations)** — a single screenshot pass gets skimmed. Repeated side-by-side rounds force real comparison.
- **Namespace + escalation rule** — parallel agents and shared files otherwise end in clobbering or local copies of shared parts.
- **Lean final replies** — orchestrator context is the scarcest resource in a many-agent run; detail lives in files.
- **Re-confirm vision every dispatch** — capability flags change between phases; a stale "no vision" line in a brief silently disables every vision gate that phase relies on.
