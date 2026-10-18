import os
import uuid
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient
from app.examples import EXAMPLES
from app.graph import GraphStore
from app.models import AnalysisInput
from app.engine import analyze


@pytest.fixture
def graph(monkeypatch):
    name = 'recurtrace_test_' + uuid.uuid4().hex
    monkeypatch.setenv('FALKORDB_GRAPH', name)
    graph = GraphStore()
    try:
        graph.health()
    except Exception:
        pytest.skip('Live FalkorDB required. Start docker compose up -d.')
    yield graph
    # This graph name was generated above and is never the application graph.
    assert graph.graph.name == name and name.startswith('recurtrace_test_')
    graph.graph.delete()


def test_graph_memory_changes_analysis_and_isolates_tenants(graph):
    ex = EXAMPLES[0]
    request = AnalysisInput(title=ex['title'], service=ex['service'], before=ex['before'], after=ex['after'])
    assert analyze(graph, 'alpha', request)['cases'] == []
    item = graph.add_incident('alpha', ex['incident'])
    result = analyze(graph, 'alpha', request)
    assert len(result['cases']) == 1
    assert result['cases'][0]['expected'] == 'payment_id'
    assert analyze(graph, 'beta', request)['cases'] == []
    graph.delete_incident('beta', item['id'])
    assert len(graph.list_incidents('alpha')) == 1
    graph.delete_incident('alpha', item['id'])
    assert analyze(graph, 'alpha', request)['cases'] == []


def test_service_scope_and_idempotent_seed(graph):
    ex = EXAMPLES[0]
    for _ in range(2): graph.add_incident('alpha', ex['incident'], 'stable-id')
    assert len(graph.list_incidents('alpha')) == 1
    assert graph.relevant('alpha', 'different-service', ['create_payment']) == []
    assert len(graph.diagram('alpha')['nodes']) == 6
    assert graph.diagram('beta')['nodes'] == []


def test_api_validates_input_and_blocks_cross_origin_writes(graph, monkeypatch):
    from app import main
    monkeypatch.setattr(main, 'store', graph)
    client = TestClient(main.app)
    assert client.get('/api/health').json()['graph'] == 'connected'
    assert client.post('/api/seed', json={}).status_code == 200
    assert len(client.get('/api/incidents').json()) == 3
    assert client.post('/api/seed',json={},headers={'Origin':'https://untrusted.example'}).status_code == 403
    assert client.post('/api/analyze',json={'before':'def (','after':'pass'}).status_code == 422
    invalid = dict(EXAMPLES[0]['incident'])
    invalid['function'] = 'another_function'
    assert client.post('/api/incidents', json=invalid).status_code == 422
    headers=client.get('/static/runner.html').headers
    assert "worker-src blob:" in headers['content-security-policy']
    assert "connect-src https://cdn.jsdelivr.net" in headers['content-security-policy']
    assert 'set-cookie' not in headers


def test_memory_survives_new_client(graph):
    graph.add_incident('alpha', EXAMPLES[1]['incident'])
    reconnected = GraphStore()
    assert len(reconnected.list_incidents('alpha')) == 1


def test_public_browser_sessions_are_separate(graph, monkeypatch):
    from app import main
    monkeypatch.setattr(main, 'store', graph)
    monkeypatch.setattr(main, 'PUBLIC', True)
    one = TestClient(main.app, base_url='https://testserver')
    two = TestClient(main.app, base_url='https://testserver')
    assert one.post('/api/seed', json={}).status_code == 200
    assert len(one.get('/api/incidents').json()) == 3
    assert two.get('/api/incidents').json() == []
    one.cookies.clear()
    one.cookies.set('recurtrace_session', 'forged.cookie')
    assert one.get('/api/incidents').json() == []
