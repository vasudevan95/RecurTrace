import ast
import json
from datetime import datetime, timezone
import uuid


def changed_functions(before: str, after: str):
    try:
        old, new = ast.parse(before), ast.parse(after)
    except (SyntaxError, RecursionError) as exc:
        raise ValueError(f'Python could not be parsed: {exc}') from exc
    kinds = (ast.FunctionDef, ast.AsyncFunctionDef)
    def funcs(tree):
        return {n.name: ast.dump(n, include_attributes=False) for n in tree.body if isinstance(n, kinds)}
    left, right = funcs(old), funcs(new)
    changed = {name for name in left.keys() | right.keys() if left.get(name) != right.get(name)}
    # Imports/global settings can change behavior without changing function bodies.
    globals_old = [ast.dump(n) for n in old.body if not isinstance(n, kinds)]
    globals_new = [ast.dump(n) for n in new.body if not isinstance(n, kinds)]
    if globals_old != globals_new:
        changed.update(left.keys() | right.keys())
    return sorted(changed)


def generate_test_file(cases):
    lines = ['"""RecurTrace regression checks. Expected values come from confirmed incidents."""',
             'import importlib', 'import json', 'import unittest', '',
             'candidate = importlib.import_module("candidate")', '',
             'class IncidentRegressionTests(unittest.TestCase):']
    if not cases:
        lines.append('    pass')
    for index, case in enumerate(cases):
        # Data is parsed from a Python string literal, never interpolated as executable source.
        data = repr(json.dumps(case, ensure_ascii=True))
        lines += [f'    def test_incident_{index + 1:03d}(self):',
                  f'        case = json.loads({data})',
                  '        fn = getattr(candidate, case["function"])',
                  '        if case["assertion"] == "raises":',
                  '            with self.assertRaises(Exception) as caught:',
                  '                fn(*case.get("args", []), **case.get("kwargs", {}))',
                  '            self.assertEqual(type(caught.exception).__name__, case["expected"], case["name"])',
                  '            return',
                  '        actual = fn(*case.get("args", []), **case.get("kwargs", {}))',
                  '        if case["assertion"] == "contains_key":',
                  '            self.assertIsInstance(actual, dict, case["name"])',
                  '            self.assertIn(case["expected"], actual, case["name"])',
                  '        elif case["assertion"] == "length":',
                  '            self.assertEqual(len(actual), case["expected"], case["name"])',
                  '        else:',
                  '            self.assertEqual(actual, case["expected"], case["name"])', '']
    lines += ['', 'if __name__ == "__main__":', '    unittest.main(verbosity=2)', '']
    return '\n'.join(lines)


def analyze(store, tenant, request):
    functions = changed_functions(request.before, request.after)
    incidents = store.relevant(tenant, request.service, functions) if functions else []
    cases = []
    evidence = []
    for incident in incidents:
        for case in incident['cases']:
            cases.append({**case, 'incident_id': incident['id'], 'source': incident['source']})
        evidence.append({
            'incident_id': incident['id'], 'title': incident['title'],
            'severity': incident['severity'], 'summary': incident['summary'],
            'contract': incident['contract'], 'source': incident['source'],
            'path': [incident['function'], incident['contract'], incident['title'], incident['cases'][0]['name']],
            'feature': incident['feature'],
        })
    if not functions:
        summary = 'No supported function changes were detected. This analyzer covers top-level Python functions and their module context.'
    elif not incidents:
        summary = 'No relevant stored incident was found. This is a gap in memory, not evidence that the change is safe.'
    else:
        summary = f'{len(incidents)} past incident(s) connect to this change through confirmed behavioral contracts. Run the selected checks to find out whether the problem recurs.'
    return {
        'id': str(uuid.uuid4()), 'created': datetime.now(timezone.utc).isoformat(),
        'title': request.title, 'service': request.service, 'functions': functions,
        'status': 'checks-ready' if cases else 'no-evidence',
        'summary': summary, 'evidence': evidence, 'cases': cases,
        'test_code': generate_test_file(cases), 'baseline_cases': [c.model_dump() for c in request.baseline_cases],
        'before': request.before, 'after': request.after,
        'mode': 'Deterministic graph workflow',
        'steps': [
            {'tool': 'inspect_python_change', 'detail': f'{len(functions)} changed function(s): {", ".join(functions) or "none"}'},
            {'tool': 'query_falkordb', 'detail': f'{len(incidents)} incident(s) retrieved through function → contract ← incident relationships.'},
            {'tool': 'build_regression_checks', 'detail': f'{len(cases)} checks built from confirmed incident expectations.'},
        ],
    }
