# Verification record

Verified locally on Windows, October 15–16, 2026.

## Automated checks

16 Python checks pass against the real local FalkorDB service. Coverage includes:

- Generated unittest execution on all three original, buggy, and corrected example functions.
- Existing baseline tests continue to pass on buggy examples, while the incident-derived checks fail.
- AST change detection: formatting-only edits, removed functions, and module-level changes.
- Invalid Python and invalid incident inputs.
- Test-data strings cannot become executable generated source.
- Retrieval changes after adding a new incident; deleting it removes future retrieval.
- Service and tenant scope; one workspace cannot delete another workspace's incident.
- Signed public browser sessions and rejection of forged session cookies.
- No-evidence results explicitly avoid claiming safety.
- AI requires opt-in; reviews that skip evidence retrieval are rejected.
- Cross-origin writes are rejected and the runner has a restricted policy.

The installed Starlette test client emits one upstream deprecation warning concerning its HTTPX adapter. It does not affect these results.

## Browser checks

- All three scenarios were run through the UI in a real browser using Pyodide.
- For each: original PASS, proposed regression FAIL, corrected PASS; baseline checks PASS throughout.
- A new synthetic incident was extracted with the existing local Ollama model, reviewed, saved through the form, retrieved for a matching code change, and executed. Its original implementation passed and its proposed regression failed.
- Local `qwen2.5:7b` completed a live tool-calling review. Its trace recorded `retrieve_incident_memory` and its response referred to the retrieved incident.
- An infinite Python loop was terminated by the 12-second execution limit.
- The worker reported the expected opaque `null` origin, rather than the application's origin.
- Edits invalidate old analysis results; browser history and exports preserve historical snapshots.
- Incident JSON download, re-import, review, save, and deletion were exercised through the UI.
- Responsive checks cover the overview, graph, walkthrough, and setup screens at 390-pixel width. A narrow-screen overflow in the walkthrough was corrected.

## Restart persistence

The actual Docker restart test exposed an initially incorrect data mount and unsupported command configuration. The configuration was corrected to mount `/var/lib/falkordb/data` and pass `REDIS_ARGS` through the image's documented entrypoint.

An AOF replay problem with parameterized graph queries was observed on the pinned image, so local persistence uses RDB snapshots (`--appendonly no --save 1 1`). All three seeded incidents were confirmed present after restarting the container. An abrupt machine failure can still lose writes newer than the latest snapshot. Export important data.

## Limits

- This is a tested local prototype, not a production security audit.
- Browser execution is not a trusted CI attestation or a hardened service for hostile code. Large allocations can exhaust browser resources.
- Live model extraction is not infallible: one draft nested a scalar argument incorrectly. The review form allowed correction before saving, and the prompt was clarified. Human confirmation remains required.
- Public Render deployment has not been performed; account setup and the actual free FalkorDB Cloud offering need verification in the user's accounts.
- Free hosting defaults to AI disabled. The tested local Ollama server is not made publicly accessible.
