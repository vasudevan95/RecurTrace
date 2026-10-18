# Essential FalkorDB queries

These are the literal Cypher queries used by `app/graph.py`, grouped by method. Parameters are passed separately to the FalkorDB client. This document reflects the implementation, including maintenance operations.

## Parameter reference

- `tenant`: server-selected workspace identifier.
- `service`, `functions`: selected service and AST-detected function names.
- `id`, `title`, `created`, `payload`: incident identifier, title, timestamp and JSON containing confirmed facts/cases.
- `fid`, `sid`, `feature_id`, `contract_id`: tenant-aware hashed node identifiers.
- `function`, `feature`, `contract`: confirmed display values.
- `cases`: arrays of case identifier, name and JSON payload.

Incident creation uses one write query. Retrieval returns incident payloads with embedded cases; the graph view also exposes RegressionCase nodes. Deletion uses several queries and is not an atomic multi-query transaction.

## health

```cypher
RETURN 1
```

## list_incidents

```cypher
MATCH (i:Incident {tenant:$tenant}) RETURN i.payload ORDER BY i.created DESC
```

## add_incident

```cypher
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
```

## relevant

```cypher
MATCH (f:Function)-[:PART_OF]->(s:Service)
WHERE f.tenant=$tenant AND s.name=$service AND f.name IN $functions
MATCH (f)-[:MUST_SATISFY]->(c:Contract)<-[:VIOLATED]-(i:Incident)
WHERE i.tenant=$tenant
RETURN DISTINCT i.payload
```

## diagram

```cypher
MATCH (n) WHERE n.tenant=$tenant
RETURN n.id, labels(n), coalesce(n.title,n.name)
```

```cypher
MATCH (a)-[r]->(b) WHERE a.tenant=$tenant AND b.tenant=$tenant
RETURN a.id, b.id, type(r)
```

## delete_incident

```cypher
MATCH (i:Incident {tenant:$tenant, id:$id})-[:PREVENTED_BY]->(t)
DETACH DELETE t
```

```cypher
MATCH (i:Incident {tenant:$tenant,id:$id}) DETACH DELETE i
```

```cypher
MATCH (c:Contract {tenant:$tenant}) WHERE NOT (:Incident)-[:VIOLATED]->(c) DETACH DELETE c
```

```cypher
MATCH (f:Function {tenant:$tenant}) WHERE NOT (:Incident)-[:AFFECTED]->(f) DETACH DELETE f
```

```cypher
MATCH (s:Service {tenant:$tenant}) WHERE NOT (:Function)-[:PART_OF]->(s) DETACH DELETE s
```

```cypher
MATCH (f:Feature {tenant:$tenant}) WHERE NOT (:Incident)-[:DISRUPTED]->(f) DETACH DELETE f
```
