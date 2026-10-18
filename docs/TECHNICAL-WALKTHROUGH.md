# Understand and verify RecurTrace

Use this with the running app and source. It is a learning guide, not a declaration that personal review has happened.

1. **Store the lesson.** Open Incident memory and inspect a seeded payment incident. All examples are synthetic. Explain the contract: the response must retain `payment_id`. Inputs and expected behavior are confirmed facts, not guesses by the model. See `app/examples.py` and `app/models.py`.
2. **Follow the relationships.** Open Knowledge graph. Find Function → MUST_SATISFY → Contract ← VIOLATED ← Incident. Explain the separate Service, Feature, and RegressionCase nodes. Read `GraphStore.add_incident` and `GraphStore.relevant` in `app/graph.py` alongside GRAPH-QUERIES.md.
3. **Detect the change.** Try the payment demo and trace it. `changed_functions` in `app/engine.py` compares Python syntax trees, ignoring formatting. Module changes conservatively select all top-level functions. This is not full dependency analysis.
4. **Select the evidence.** The backend queries FalkorDB for the workspace, service, and changed function names. It reads confirmed cases from the retrieved incident payload. No matching incident means missing coverage, not a safe change.
5. **Prove the regression.** Compare with the corrected example. Baseline checks pass for all three versions; the incident check passes on the original, fails on the proposed change, and passes on the supplied correction. Read the downloaded unittest. The correction is supplied example code, not an autonomous AI fix.
6. **Explain execution.** `static/runner-frame.js` runs Python with Pyodide in a worker inside a sandboxed, opaque-origin iframe. The server parses but does not execute uploaded code. The time limit stops loops, but the browser runner is not a trusted CI system or a hardened hostile-code service.
7. **Explain the optional agent.** In `app/ai.py`, the model must call `retrieve_incident_memory` before completing its review. The backend scopes retrieval. A model explanation cannot prove a test result. Default operation disables AI; local model availability is a separate prerequisite.
8. **Verify personal understanding.** Create a small synthetic incident with your own expected behavior, analyze a matching function change, and explain why the selected assertion passes or fails. Keep notes of what you actually did; do not claim agent-run checks as personal review.

Questions to answer before presenting: Why does the query need the contract relationship? Where do expected values come from? What happens without FalkorDB? What happens with no relevant incident? Which steps are deterministic, which use a model, and which execute Python? What is outside the supported scope?
