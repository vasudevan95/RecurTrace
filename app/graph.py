import hashlib
import json
import os
import uuid
from datetime import datetime, timezone
from falkordb import FalkorDB


def ident(*parts):
    return hashlib.sha256('|'.join(parts).encode()).hexdigest()[:24]


class GraphStore:
    """All incident facts and test cases live in FalkorDB, including tenant boundaries."""

    def __init__(self):
        self.db = FalkorDB(
            host=os.getenv('FALKORDB_HOST', '127.0.0.1'),
            port=int(os.getenv('FALKORDB_PORT', '6387')),
            password=os.getenv('FALKORDB_PASSWORD') or None,
            username=os.getenv('FALKORDB_USERNAME') or None,
            ssl=os.getenv('FALKORDB_SSL', 'false').lower() == 'true',
            socket_connect_timeout=3, socket_timeout=8,
        )
        self.graph = self.db.select_graph(os.getenv('FALKORDB_GRAPH', 'recurtrace'))

    def health(self):
        # GRAPH.QUERY initializes the graph on first launch; RO_QUERY cannot
        # read a graph key that does not exist yet.
        return self.graph.query('RETURN 1').result_set[0][0] == 1

    def list_incidents(self, tenant):
        rows = self.graph.ro_query(
            'MATCH (i:Incident {tenant:$tenant}) RETURN i.payload ORDER BY i.created DESC',
            {'tenant': tenant}).result_set
        return [json.loads(row[0]) for row in rows]

    def add_incident(self, tenant, incident, incident_id=None):
        item = dict(incident)
        item['id'] = incident_id or str(uuid.uuid4())
        item['created'] = datetime.now(timezone.utc).isoformat()
        item['cases'] = [dict(c) for c in item['cases']]
        params = {
            'tenant': tenant, 'id': item['id'], 'title': item['title'],
            'created': item['created'], 'payload': json.dumps(item),
            'fid': ident(tenant, item['service'], item['function']),
            'function': item['function'], 'service': item['service'],
            'sid': ident(tenant, item['service']),
            'feature_id': ident(tenant, item['feature']), 'feature': item['feature'],
            'contract_id': ident(tenant, item['id'], 'contract'), 'contract': item['contract'],
            'cases': [[ident(tenant, item['id'], str(n)), case['name'], json.dumps(case)]
                      for n, case in enumerate(item['cases'])],
        }
        self.graph.query('''
            MERGE (i:Incident {tenant:$tenant, id:$id})
            ON CREATE SET i.title=$title, i.payload=$payload, i.created=$created
            MERGE (f:Function {id:$fid}) SET f.name=$function, f.tenant=$tenant
            MERGE (s:Service {id:$sid}) SET s.name=$service, s.tenant=$tenant
            MERGE (feature:Feature {id:$feature_id}) SET feature.name=$feature, feature.tenant=$tenant
            MERGE (c:Contract {id:$contract_id}) SET c.name=$contract, c.tenant=$tenant
            MERGE (i)-[:AFFECTED]->(f)
            MERGE (f)-[:PART_OF]->(s)
            MERGE (s)-[:SUPPORTS]->(feature)
            MERGE (i)-[:DISRUPTED]->(feature)
            MERGE (i)-[:VIOLATED]->(c)
            MERGE (f)-[:MUST_SATISFY]->(c)
            WITH i
            UNWIND $cases AS testcase
            MERGE (t:RegressionCase {id:testcase[0]})
            SET t.name=testcase[1], t.payload=testcase[2], t.tenant=$tenant
            MERGE (i)-[:PREVENTED_BY]->(t)
        ''', params)
        return item

    def relevant(self, tenant, service, functions):
        # Multi-hop query: changed function -> contract <- incident -> case.
        # A case can also cover a function that was removed by the change.
        rows = self.graph.ro_query('''
            MATCH (f:Function)-[:PART_OF]->(s:Service)
            WHERE f.tenant=$tenant AND s.name=$service AND f.name IN $functions
            MATCH (f)-[:MUST_SATISFY]->(c:Contract)<-[:VIOLATED]-(i:Incident)
            WHERE i.tenant=$tenant
            RETURN DISTINCT i.payload
        ''', {'tenant': tenant, 'service': service, 'functions': functions}).result_set
        return [json.loads(row[0]) for row in rows]

    def diagram(self, tenant):
        nodes = self.graph.ro_query('''
            MATCH (n) WHERE n.tenant=$tenant
            RETURN n.id, labels(n), coalesce(n.title,n.name)
        ''', {'tenant': tenant}).result_set
        edges = self.graph.ro_query('''
            MATCH (a)-[r]->(b) WHERE a.tenant=$tenant AND b.tenant=$tenant
            RETURN a.id, b.id, type(r)
        ''', {'tenant': tenant}).result_set
        return {'nodes': [{'id': r[0], 'type': r[1][0], 'label': r[2]} for r in nodes],
                'edges': [{'source': r[0], 'target': r[1], 'label': r[2]} for r in edges]}

    def delete_incident(self, tenant, incident_id):
        self.graph.query('''
            MATCH (i:Incident {tenant:$tenant, id:$id})-[:PREVENTED_BY]->(t)
            DETACH DELETE t
        ''', {'tenant': tenant, 'id': incident_id})
        self.graph.query('MATCH (i:Incident {tenant:$tenant,id:$id}) DETACH DELETE i',
                         {'tenant': tenant, 'id': incident_id})
        self.graph.query('MATCH (c:Contract {tenant:$tenant}) WHERE NOT (:Incident)-[:VIOLATED]->(c) DETACH DELETE c', {'tenant': tenant})
        self.graph.query('MATCH (f:Function {tenant:$tenant}) WHERE NOT (:Incident)-[:AFFECTED]->(f) DETACH DELETE f', {'tenant': tenant})
        self.graph.query('MATCH (s:Service {tenant:$tenant}) WHERE NOT (:Function)-[:PART_OF]->(s) DETACH DELETE s', {'tenant': tenant})
        self.graph.query('MATCH (f:Feature {tenant:$tenant}) WHERE NOT (:Incident)-[:DISRUPTED]->(f) DETACH DELETE f', {'tenant': tenant})

