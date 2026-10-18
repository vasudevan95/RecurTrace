# RecurTrace: a three-minute demonstration

## 0:00 — The problem

"Teams write postmortems, but a document does not prevent the same bug returning. RecurTrace turns a confirmed incident lesson into a regression check for a later change."

Open **How it works** to show the illustrated story. These are synthetic incidents, not claims about real production outages.

## 0:25 — The remembered lesson

Open **Incident memory**. Show the payment response incident. A legacy subscription client needs `payment_id`; the expected behavior is recorded explicitly.

Open **Knowledge graph**. Show the function, contract, incident, and regression case. Explain that FalkorDB stores the connections and serves the retrieval query.

## 0:55 — The new change

Open **Overview → Try the working demo**. The original function returns `payment_id`. The proposed function returns `id` instead.

Click **Trace this change**. The AST comparison identifies the changed function. A multi-hop FalkorDB query retrieves its contract and incident. Show the evidence source and analysis trace.

## 1:30 — The proof

Click **Compare with corrected example**. Allow the runtime to load on first use.

- Original: existing checks pass; the incident-derived check passes.
- Proposed: existing checks pass; the incident-derived check fails.
- Corrected example: both sets of checks pass.

"The useful result is not an AI warning. It is an executable assertion backed by an incident, and a reproducible failure."

## 2:15 — Make it reusable

Download the unittest file. Show that it imports `candidate.py` and asserts the confirmed behavior. Open history or export the report.

Optionally add a new structured incident, then reanalyze a related change to demonstrate that graph memory changes selected coverage.

## 2:45 — Be precise about scope

"The no-key version uses deterministic graph retrieval and test templates. Optional AI helps draft incident facts for user review. We support top-level Python functions in this prototype. A lack of remembered incidents is not a safety guarantee."

FalkorDB is central: without the relationship query, no historical regression checks are selected. Browser execution makes the demonstration inexpensive without running uploaded code on the application server.
