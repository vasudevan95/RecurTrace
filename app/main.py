import hashlib
import hmac
import os
import secrets
import time
from collections import defaultdict, deque
from pathlib import Path
from threading import Lock

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / '.env')
from . import ai
from .engine import analyze
from .examples import EXAMPLES
from .graph import GraphStore
from .models import AnalysisInput, IncidentInput, ReportInput

app = FastAPI(title='RecurTrace', version='1.0.0', docs_url='/api/docs')
store = GraphStore()
PUBLIC = os.getenv('PUBLIC_DEMO', 'false').lower() == 'true'
SECRET = os.getenv('SESSION_SECRET', '')
if PUBLIC and (len(SECRET) < 32 or SECRET.startswith('replace-')):
    raise RuntimeError('PUBLIC_DEMO requires a random SESSION_SECRET of at least 32 characters.')
SECRET = SECRET or 'recurtrace-local-only-cookie-signing-key'
limits = defaultdict(deque)
guard = Lock()


def signature(value):
    return hmac.new(SECRET.encode(), value.encode(), hashlib.sha256).hexdigest()


@app.middleware('http')
async def session_and_headers(request: Request, call_next):
    cookie = request.cookies.get('recurtrace_session', '')
    token, _, sig = cookie.partition('.')
    if len(token) != 32 or not hmac.compare_digest(signature(token), sig):
        token = secrets.token_hex(16)
    request.state.tenant = token if PUBLIC else 'local-workspace'
    if request.url.path.startswith('/api/') and request.method in ('POST', 'DELETE', 'PUT'):
        # Browsers cannot submit mutating cross-origin requests to this app.
        origin = request.headers.get('origin')
        if origin and origin.rstrip('/') != str(request.base_url).rstrip('/'):
            return JSONResponse({'detail': 'Cross-origin writes are not allowed.'}, status_code=403)
        if int(request.headers.get('content-length', '0') or '0') > 120000:
            return JSONResponse({'detail': 'Request is too large.'}, status_code=413)
        if request.method == 'POST' and 'application/json' not in request.headers.get('content-type', ''):
            return JSONResponse({'detail': 'Use application/json.'}, status_code=415)
        address = request.client.host if request.client else 'unknown'
        now = time.monotonic()
        with guard:
            if len(limits) > 1000:
                for key in list(limits):
                    if not limits[key] or limits[key][-1] < now - 60:
                        del limits[key]
            recent = limits[address]
            while recent and recent[0] < now - 60:
                recent.popleft()
            if len(recent) >= 60:
                return JSONResponse({'detail': 'Please wait a minute before trying again.'}, status_code=429)
            recent.append(now)
    response = await call_next(request)
    # Opaque-origin runner assets must never rotate the browser workspace cookie.
    if not request.url.path.startswith('/static/'):
        response.set_cookie('recurtrace_session', token + '.' + signature(token), httponly=True,
                            secure=PUBLIC, samesite='strict', max_age=60 * 60 * 24 * 30)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'same-origin'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Content-Security-Policy'] = (
        "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; "
        "style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; "
        "connect-src 'self' https://cdn.jsdelivr.net; worker-src 'self'; frame-src 'self'; "
        "object-src 'none'; base-uri 'self'; form-action 'self'"
    )
    if request.url.path == '/static/runner.html':
        response.headers['Content-Security-Policy'] = (
            "default-src 'none'; script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; "
            "connect-src https://cdn.jsdelivr.net; worker-src blob:; "
            "style-src 'none'; img-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
        )
        # The runner is intentionally framed by this application, with a sandbox
        # opaque origin. Other pages remain unframeable.
        del response.headers['X-Frame-Options']
    if request.url.path.startswith('/api/'):
        response.headers['Cache-Control'] = 'no-store'
    else:
        response.headers['Cache-Control'] = 'no-cache'
    return response


def database_error():
    return HTTPException(503, 'FalkorDB is unavailable. Start the local graph with docker compose up -d, or check the cloud connection settings. No simulated graph is used.')


@app.get('/api/health')
def health():
    try:
        ok = store.health()
    except Exception:
        ok = False
    return {'app': 'RecurTrace', 'graph': 'connected' if ok else 'offline',
            'ai': ai.available(), 'public_demo': PUBLIC,
            'ai_model': os.getenv('AI_MODEL', '') if ai.available() else '',
            'ai_local': os.getenv('AI_BASE_URL', '').startswith(('http://127.0.0.1:', 'http://localhost:')),
            'runner': 'Browser Python · Pyodide', 'version': '1.0.0'}


@app.get('/api/examples')
def examples():
    return EXAMPLES


@app.post('/api/seed')
def seed(request: Request):
    try:
        existing = {x['id'] for x in store.list_incidents(request.state.tenant)}
        for example in EXAMPLES:
            iid = 'demo-' + example['id']
            if iid not in existing:
                store.add_incident(request.state.tenant, example['incident'], iid)
        return {'incidents': store.list_incidents(request.state.tenant)}
    except Exception as exc:
        raise database_error() from exc


@app.get('/api/incidents')
def incidents(request: Request):
    try:
        return store.list_incidents(request.state.tenant)
    except Exception as exc:
        raise database_error() from exc


@app.post('/api/incidents', status_code=201)
def add_incident(body: IncidentInput, request: Request):
    if any(case.function != body.function for case in body.cases):
        raise HTTPException(422, 'Each regression case must reference the incident function.')
    try:
        if len(store.list_incidents(request.state.tenant)) >= 50:
            raise HTTPException(409, 'This demo workspace is limited to 50 incidents. Export or remove an incident first.')
        return store.add_incident(request.state.tenant, body.model_dump())
    except HTTPException:
        raise
    except Exception as exc:
        raise database_error() from exc


@app.delete('/api/incidents/{incident_id}')
def delete_incident(incident_id: str, request: Request):
    try:
        store.delete_incident(request.state.tenant, incident_id)
        return {'deleted': incident_id}
    except Exception as exc:
        raise database_error() from exc


@app.get('/api/graph')
def graph(request: Request):
    try:
        return store.diagram(request.state.tenant)
    except Exception as exc:
        raise database_error() from exc


@app.post('/api/analyze')
def analyze_change(body: AnalysisInput, request: Request):
    try:
        return analyze(store, request.state.tenant, body)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except Exception as exc:
        raise database_error() from exc


@app.post('/api/extract-incident')
async def extract(body: ReportInput):
    try:
        return {'draft': await ai.extract_incident(body.report), 'requires_review': True}
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(502, 'The AI provider could not return a valid draft. Your report was not saved. Check the provider configuration or use the structured form.') from exc


@app.post('/api/agent-review')
async def agent_review(body: AnalysisInput, request: Request):
    try:
        analysis = analyze(store, request.state.tenant, body)
        def retrieve():
            fresh = analyze(store, request.state.tenant, body)
            return {'evidence': fresh['evidence'], 'checks': fresh['cases']}
        return await ai.review_change(analysis, retrieve)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(502, 'The AI review could not finish. Your deterministic graph evidence is still available. Check the model connection and retry.') from exc


@app.get('/')
def index():
    return FileResponse(ROOT / 'static' / 'index.html')


app.mount('/static', StaticFiles(directory=ROOT / 'static'), name='static')
