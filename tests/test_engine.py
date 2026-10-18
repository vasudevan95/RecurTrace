import ast
import importlib.util
import json
import subprocess
import sys
from pathlib import Path

import pytest

from app.engine import analyze, changed_functions, generate_test_file
from app.examples import EXAMPLES
from app.models import AnalysisInput, IncidentInput


@pytest.mark.parametrize('example', EXAMPLES, ids=lambda e: e['id'])
def test_real_generated_regression_fails_only_for_buggy_change(example, tmp_path):
    """Run generated unittest against trusted repository fixtures, not uploaded code."""
    cases = example['incident']['cases']
    (tmp_path / 'test_regression.py').write_text(generate_test_file(cases), encoding='utf-8')
    for version, expected in [('before', 0), ('after', 1), ('fixed', 0)]:
        candidate = tmp_path / 'candidate.py'
        candidate.write_text(example[version], encoding='utf-8')
        # -B plus deleting only this test's pycache avoids stale imports when
        # versions have identical size and filesystem timestamps.
        cache = tmp_path / '__pycache__'
        if cache.exists():
            for file in cache.glob('candidate.*.pyc'):
                file.unlink()
        result = subprocess.run([sys.executable, '-B', str(tmp_path/'test_regression.py')],
                                cwd=tmp_path, capture_output=True, text=True, timeout=10)
        assert result.returncode == expected, result.stderr
        (tmp_path / 'test_baseline.py').write_text(generate_test_file(example['baseline_cases']), encoding='utf-8')
        base = subprocess.run([sys.executable, '-B', str(tmp_path/'test_baseline.py')],
                              cwd=tmp_path, capture_output=True, text=True, timeout=10)
        assert base.returncode == 0, base.stderr


def test_change_detection_ignores_formatting_and_includes_removed_functions():
    assert changed_functions('def f():\n return 1\n', 'def f():\n    return 1\n') == []
    assert changed_functions('def f():\n return 1\n', 'pass\n') == ['f']


def test_global_change_rechecks_functions():
    assert changed_functions('RATE = 2\ndef f():\n return RATE\n', 'RATE = 3\ndef f():\n return RATE\n') == ['f']


def test_invalid_python_is_reported():
    with pytest.raises(ValueError, match='could not be parsed'):
        changed_functions('def f(', 'pass')


def test_generated_case_data_cannot_inject_source():
    code = generate_test_file([{'name': 'quote injection', 'function': 'f', 'args': [],
                               'assertion': 'equals', 'expected': '\"; __import__("os").system("bad")\n'}])
    tree = ast.parse(code)
    assert not any(isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == '__import__' for n in ast.walk(tree))


def test_no_graph_evidence_never_claims_safe():
    class EmptyGraph:
        def relevant(self, *args): return []
    request = AnalysisInput(before='def unrelated():\n return 1', after='def unrelated():\n return 2')
    result = analyze(EmptyGraph(), 'unit-test', request)
    assert result['status'] == 'no-evidence'
    assert 'not evidence that the change is safe' in result['summary']
    assert result['cases'] == []


def test_all_demo_incidents_validate():
    for example in EXAMPLES:
        IncidentInput.model_validate(example['incident'])
