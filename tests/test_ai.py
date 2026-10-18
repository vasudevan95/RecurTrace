import asyncio
from app import ai


def test_ai_requires_explicit_enable(monkeypatch):
    monkeypatch.setenv('ENABLE_AI','false')
    monkeypatch.setenv('AI_API_KEY','some-key')
    assert not ai.available()
    monkeypatch.setenv('ENABLE_AI','true')
    monkeypatch.delenv('AI_API_KEY',raising=False)
    assert not ai.available()


def test_ai_will_not_claim_review_without_retrieving(monkeypatch):
    monkeypatch.setenv('ENABLE_AI','true')
    monkeypatch.setenv('AI_API_KEY','test-only')
    class Response:
        def raise_for_status(self): pass
        def json(self): return {'choices':[{'message':{'content':'Looks safe!'}}]}
    class Client:
        def __init__(self, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self,*args): pass
        async def post(self,*args,**kwargs): return Response()
    monkeypatch.setattr(ai.httpx,'AsyncClient',Client)
    import pytest
    with pytest.raises(ValueError,match='step limit'):
        asyncio.run(ai.review_change({'service':'x','functions':['f'],'before':'','after':''},lambda:{}))
