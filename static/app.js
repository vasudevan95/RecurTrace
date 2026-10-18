'use strict';
const $ = (s, root = document) => root.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state = {health: {}, examples: [], incidents: [], selected: null, analysis: null, results: null, route: 'overview', busy: false, tour: 0, importQueue: []};
const titles = {overview:'Overview', analyze:'Analyze a change', memory:'Incident memory', graph:'Knowledge graph', history:'Analysis history', walkthrough:'How it works', settings:'Setup & connections'};
const main = $('#main');
let toastTimer;
function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 6000); }
async function api(path, options = {}) {
  const response = await fetch('/api/' + path, {credentials:'same-origin', ...options, headers:{'Content-Type':'application/json', ...options.headers}});
  let data; try { data = await response.json(); } catch { throw new Error('The server returned an unexpected response. Please retry.'); }
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : (data.detail || []).map(x => x.msg).join('; ') || 'The request failed.');
  return data;
}
const post = (path, data = {}) => api(path, {method:'POST', body:JSON.stringify(data)});
function getHistory() { try { return JSON.parse(localStorage.getItem('recurtrace-history') || '[]'); } catch { return []; } }
function saveHistory() {
  if (!state.analysis) return;
  const records = getHistory().filter(x => x.id !== state.analysis.id);
  records.unshift({...state.analysis, results:state.results, example_id:state.selected?.id || null});
  try { localStorage.setItem('recurtrace-history', JSON.stringify(records.slice(0, 20))); } catch { toast('Browser storage is full. Download your report to keep this result.'); }
}
function download(filename, content, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], {type}));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function heading(title, subtitle, action = '') { return `<div class="page-heading"><div><div class="eyebrow">${esc(state.route === 'overview' ? 'YOUR INCIDENT INTELLIGENCE WORKSPACE' : 'RECURTRACE / ' + titles[state.route])}</div><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`; }
function badge(text, color = '') { return `<span class="badge ${color}">${esc(text)}</span>`; }
function formatReview(text) {
  return String(text).split(/```(?:python)?\n?/).map((part,index)=>index%2 ? `<pre class="code-block">${esc(part)}</pre>` : part.split(/\n\n+/).filter(Boolean).map(p=>`<p>${esc(p).replace(/`([^`]+)`/g,'<code>$1</code>')}</p>`).join('')).join('');
}
function lockInputs() { document.querySelectorAll('#analysis-form input,#analysis-form textarea').forEach(el=>{el.disabled=state.busy;}); }
function graphNotice() { return state.health.graph !== 'connected' ? '<div class="notice error">FalkorDB is offline. Start Docker and run <code>docker compose up -d</code> in the project folder, then <button class="text-button" data-action="refresh">reconnect</button>. Evidence analysis requires the real graph.</div>' : ''; }
function updateStatus() {
  $('#graph-dot').className = 'status-dot ' + (state.health.graph === 'connected' ? 'online' : 'offline');
  $('#graph-status').textContent = state.health.graph === 'connected' ? 'FalkorDB connected' : 'FalkorDB offline';
  $('#memory-count').textContent = state.incidents.length;
}
async function refresh() {
  state.health = await api('health');
  state.incidents = state.health.graph === 'connected' ? await api('incidents') : [];
  updateStatus();
}
function overview() {
  const history = getHistory();
  const failures = history.reduce((n, h) => n + (h.results?.find(r => r.version === 'proposed')?.regression.filter(t => !t.passed).length || 0), 0);
  return heading('Never repeat the incident.', 'Your past outages hold the clues. Turn them into checks for your next change.', '<button class="primary" data-action="new-analysis">＋ Analyze a change</button>') + graphNotice() + `
    <section class="hero"><div><div class="eyebrow">FROM HINDSIGHT TO A SAFETY NET</div><h2>That bug looks familiar.<br><span>Catch it before it ships.</span></h2><p>Connect a code change to the incidents behind it. Follow the evidence. Run the test your team was missing.</p><button class="lime-button" data-action="demo" data-id="payment-contract">Try the working demo <span>↗</span></button></div>
    <div class="hero-graphic" aria-label="Past incident connects through a knowledge graph to a regression test"><div class="mini-track"><div class="mini-node"><small>REMEMBER</small><strong>Past incident</strong></div><span class="mini-arrow">→</span><div class="mini-node"><small>CONNECT</small><strong>Knowledge graph</strong></div><span class="mini-arrow">→</span><div class="mini-node"><small>PREVENT</small><strong>Regression test</strong></div></div><div class="graphic-caption">One lesson learned. Every future change informed.</div></div></section>
    <section class="stats" aria-label="Workspace statistics"><div class="stat"><div class="stat-label">Incidents in memory</div><strong>${state.incidents.length.toString().padStart(2,'0')}</strong><small>stored in your graph</small></div><div class="stat"><div class="stat-label">Changes analyzed</div><strong>${history.length.toString().padStart(2,'0')}</strong><small>in this browser</small></div><div class="stat"><div class="stat-label">Failing regression checks</div><strong>${failures.toString().padStart(2,'0')}</strong><small>from executed runs</small></div></section>
    <div class="section-heading"><div><h2>See a repeat caught in action</h2><p>Three fictional incidents. Real Python execution.</p></div><a href="#walkthrough" class="text-button">How it works ↗</a></div>
    <section class="scenario-grid">${state.examples.map((ex,i) => `<article class="scenario-card"><div class="scenario-number"><span class="scenario-symbol">${['↔','⟳','÷'][i]}</span><span>SCENARIO 0${i+1}</span></div><h3>${esc(ex.title)}</h3><p>${esc(ex.subtitle)}</p><div class="scenario-footer"><span>${['API contract','Idempotency','Money precision'][i]}</span><button data-action="demo" data-id="${ex.id}">Explore scenario →</button></div></article>`).join('')}</section>
    <div class="lower-grid"><section class="panel"><div class="panel-heading"><h2>Lessons in your graph</h2><a class="text-button" href="#memory">View memory ↗</a></div>${state.incidents.length ? state.incidents.slice(0,3).map(i => `<div class="incident-row"><span class="incident-dot"></span><div><strong>${esc(i.title)}</strong><small>${esc(i.function)} · ${esc(i.feature)}</small></div>${badge(i.severity, i.severity === 'high' ? 'red' : 'amber')}</div>`).join('') : '<p>Your graph is empty. Start a demo to load three sample incidents, or add your own.</p><button class="text-button" data-action="seed">Load demo incidents →</button>'}</section>
    <section class="panel"><h2>A clear path from incident to prevention</h2><div class="step-list"><div class="small-step"><span>1</span><div><strong>Remember what went wrong</strong><p>Capture the incident and expected behavior.</p></div></div><div class="small-step"><span>2</span><div><strong>Trace a new change</strong><p>Find relevant lessons through the graph.</p></div></div><div class="small-step"><span>3</span><div><strong>Put the lesson to the test</strong><p>Run a check. See the failure. Verify the fix.</p></div></div></div></section></div>`;
}

function analyzePage() {
  const ex = state.selected;
  const current = state.analysis;
  return heading('A new change. An old lesson?', 'Compare Python code and let the graph find the checks worth running.', '<button data-action="load-first">Load an example ↗</button>') + graphNotice() + `
    <div class="notice">${state.health.ai ? 'AI extraction is configured. ' : 'No API key needed. '}This analysis uses confirmed incident facts and real FalkorDB queries. It does not certify that a release is safe.</div>
    <form id="analysis-form"><div class="fields-row"><div class="field"><label for="change-title">Change title</label><input id="change-title" name="title" required minlength="3" maxlength="140" value="${esc(current?.title || ex?.title || 'Review payment response change')}"></div><div class="field"><label for="service">Service name</label><input id="service" name="service" required maxlength="80" value="${esc(current?.service || ex?.service || 'payments')}"></div></div>
    <div class="editor-layout"><div class="editor-panel"><div class="editor-toolbar"><strong>Original · candidate.py</strong><span>BEFORE</span></div><textarea spellcheck="false" class="code-editor" id="before-code" name="before" aria-label="Original Python code" required maxlength="30000">${esc(current?.before || ex?.before || '')}</textarea></div><div class="editor-panel"><div class="editor-toolbar"><strong>Proposed · candidate.py</strong><span>AFTER</span></div><textarea spellcheck="false" class="code-editor" id="after-code" name="after" aria-label="Proposed Python code" required maxlength="30000">${esc(current?.after || ex?.after || '')}</textarea></div></div>
    <div class="analysis-actions"><small>Scope: top-level Python functions · Standard-library examples</small><button class="primary" type="submit" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Tracing evidence…' : 'Trace this change →'}</button></div></form>
    <div id="analysis-result">${current ? resultsView() : ''}</div>`;
}
function resultsView() {
  const a = state.analysis;
  if (!a) return '';
  return `<div class="analysis-top"><h2>Evidence for this change</h2>${badge(a.mode, 'neutral')}</div>
    <div class="result-banner"><h2>${a.cases.length ? `${a.cases.length} regression check${a.cases.length > 1 ? 's' : ''} worth running` : 'No matching incident evidence'}</h2><p>${esc(a.summary)}</p><div class="path-flow">${a.functions.map(f => `<span class="path-chip">ƒ ${esc(f)}</span>`).join('')}</div></div>
    ${a.evidence.map(e => `<section class="panel wide-panel"><div class="panel-heading"><h2>${esc(e.title)}</h2>${badge(e.severity + ' impact', e.severity === 'high' ? 'red' : 'amber')}</div><p>${esc(e.summary)}</p><div class="path-flow"><span class="path-chip">${esc(a.functions.join(', '))}</span><span class="path-arrow">→</span><span class="path-chip">Behavioral contract</span><span class="path-arrow">←</span><span class="path-chip incident">Past incident</span><span class="path-arrow">→</span><span class="path-chip">Regression check</span></div><div class="contract">${esc(e.contract)}</div><div class="evidence-source">SOURCE: ${esc(e.source)} · Affected feature: ${esc(e.feature)}</div></section>`).join('')}
    <details class="trace"><summary>Inspect the analysis trace · ${a.steps.length} steps</summary>${a.steps.map(s => `<div class="trace-step"><div><code>${esc(s.tool)}</code><div>${esc(s.detail)}</div></div></div>`).join('')}</details>
    ${state.health.ai ? `<section class="panel wide-panel"><div class="panel-heading"><div><h2>A second look from the AI agent</h2><p>${state.health.ai_local ? 'Runs on your computer' : 'Uses your configured provider'} · ${esc(state.health.ai_model)} · Retrieves graph evidence through a tool call</p></div><button data-action="agent-review" ${state.busy?'disabled':''}>Ask the agent →</button></div><div id="agent-review-result">${a.ai_review ? `${formatReview(a.ai_review.text)}<details class="trace"><summary>Model tool trace</summary>${a.ai_review.trace.map(s=>`<div class="trace-step"><code>${esc(s.tool)}</code> ${esc(s.detail)}</div>`).join('')}</details>` : '<p>The agent will retrieve the incident evidence and explain the check to run. Execution results remain separate.</p>'}</div></section>` : ''}
    ${a.cases.length ? `<section class="panel wide-panel"><div class="panel-heading"><div><h2>Run the lesson against the change</h2><p>Actual Python execution in an isolated browser frame. Results stay on your device.</p></div></div><div class="button-row"><button class="primary" data-action="run" ${state.busy ? 'disabled' : ''}>▷ Run original vs. proposed</button>${state.selected ? '<button data-action="compare" '+ (state.busy ? 'disabled' : '') +'>Compare with corrected example</button>' : ''}<button data-action="download-test">↓ Download test</button><button data-action="download-report">↓ Export report</button></div><p class="form-help" style="margin-top:12px">First run downloads the Python runtime. Standard-library functions are supported; each run has a 12-second execution limit.</p><div id="runner-progress" role="status" aria-live="polite"></div><div id="run-results">${state.results ? runResults() : ''}</div><details class="trace"><summary>View generated unittest code</summary><pre class="code-block">${esc(a.test_code)}</pre></details></section>` : '<p>Add a confirmed incident in Incident memory, then analyze this change again.</p>'}`;
}
function runResults() {
  const runs = state.results || [];
  const names = {original:'Original implementation', proposed:'Proposed change', corrected:'Corrected example'};
  return `<div class="run-summary">${runs.map(r => {
    const passed = !r.error && r.regression.every(t => t.passed);
    return `<div class="run-card ${passed ? '' : 'failed'}"><h3>${names[r.version]}</h3><div class="run-status">${r.error ? 'ERROR' : passed ? 'PASS' : 'FAIL'}</div><p>${r.error ? esc(r.error) : `${r.baseline.filter(t => t.passed).length}/${r.baseline.length} existing checks passed<br>${r.regression.filter(t => t.passed).length}/${r.regression.length} incident checks passed`}</p></div>`;
  }).join('')}</div><table class="test-table"><thead><tr><th>EXECUTED CHECK</th>${runs.map(r => `<th>${names[r.version]}</th>`).join('')}</tr></thead><tbody>${['baseline','regression'].flatMap(group => (state.analysis[group === 'baseline' ? 'baseline_cases' : 'cases'] || []).map((test,i) => `<tr><td>${esc(test.name)}<small>${group === 'baseline' ? 'Existing coverage' : 'From incident memory'}</small></td>${runs.map(r => {const t = r[group]?.[i]; return `<td>${!t ? badge('Not run','neutral') : badge(t.passed ? 'PASS' : 'FAIL',t.passed ? '' : 'red')}${t && !t.passed ? `<div class="test-detail">${esc(t.detail)}</div>` : ''}</td>`;}).join('')}</tr>`)).join('')}</tbody></table><p class="form-help" style="margin-top:15px">Browser-computed results are for exploration, not a trusted CI attestation. Download the test to run in your own test suite.</p>`;
}
function memoryPage() {
  return heading('Make the lesson last.', 'Confirmed incident facts become the memory behind future checks.', '<button class="primary" data-action="add-incident">＋ Add an incident</button>') + graphNotice() + `
    <div class="section-heading"><div class="memory-toolbar"><input type="search" class="search" id="incident-search" aria-label="Search incidents" placeholder="Search incidents or functions…"><span class="muted" style="font-size:11px">${state.incidents.length} incidents in FalkorDB</span></div><div class="button-row"><button data-action="seed">Load examples</button><button data-action="export-memory">↓ Export</button></div></div>
    <div id="incident-list">${incidentCards(state.incidents)}</div>`;
}
function incidentCards(incidents) {
  if (!incidents.length) return '<div class="empty-state"><h2>No incidents here yet.</h2><p>Add an incident with its expected behavior, or load the three demo examples.</p><button class="primary" data-action="add-incident">Add an incident</button></div>';
  return incidents.map(i => `<article class="memory-card"><div class="memory-card-top"><h2>${esc(i.title)}</h2>${badge(i.severity, i.severity === 'high' ? 'red' : 'amber')}</div><p>${esc(i.summary)}</p><div class="contract">${esc(i.contract)}</div><div class="memory-meta"><span>ƒ <code>${esc(i.function)}</code></span><span>${esc(i.service)}</span><span>${esc(i.feature)}</span><span>${i.cases.length} regression check(s)</span></div><div class="evidence-source">${esc(i.source)}</div><div class="memory-actions"><button class="text-button" data-action="view-incident" data-id="${esc(i.id)}">Inspect / export →</button><button class="text-button danger" data-action="delete-incident" data-id="${esc(i.id)}">Remove from memory</button></div></article>`).join('');
}

function diagramSVG(data) {
  const columns = ['Service','Function','Contract','Incident','RegressionCase','Feature'];
  const labels = {Service:'SERVICE', Function:'FUNCTION', Contract:'CONTRACT', Incident:'INCIDENT', RegressionCase:'REGRESSION CHECK', Feature:'FEATURE'};
  const palette = {Service:'#e9efe7',Function:'#e6f1de',Contract:'#edf4e7',Incident:'#fff0e6',RegressionCase:'#dfedda',Feature:'#eef0e9'};
  const grouped = columns.map(type => data.nodes.filter(n => n.type === type));
  const height = Math.max(400, ...grouped.map(g => g.length * 115 + 90));
  const positions = {};
  grouped.forEach((group,col) => group.forEach((node,row) => { positions[node.id] = {x:20 + col*180,y:75 + row*115}; }));
  let svg = `<svg viewBox="0 0 1100 ${height}" role="img" aria-label="Live FalkorDB knowledge graph. Select a node to inspect it."><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#b9c9ad"/></marker></defs>`;
  columns.forEach((type,col) => {svg += `<text x="${col*180 + 25}" y="32" fill="#7f9072" font-size="8" font-family="Segoe UI,sans-serif" letter-spacing="1">${labels[type]}</text>`;});
  data.edges.forEach(e => { const a = positions[e.source], b = positions[e.target]; if (!a || !b) return; const forward = b.x>a.x; const x1=a.x+(forward?145:0), x2=b.x+(forward?0:145); const y1=a.y+33,y2=b.y+33; svg += `<path d="M ${x1} ${y1} C ${(x1+x2)/2} ${y1}, ${(x1+x2)/2} ${y2}, ${x2} ${y2}" fill="none" stroke="#cbd8c3" stroke-width="1.2" marker-end="url(#arrow)" opacity=".8"><title>${esc(e.label)}</title></path>`; });
  data.nodes.forEach(n => { const p=positions[n.id]; if (!p) return; const chunks = String(n.label).match(/.{1,21}(?:\s|$)|.{1,21}/g) || []; svg += `<g class="graph-node" role="button" tabindex="0" aria-label="${esc(n.type + ': ' + n.label)}" data-node="${esc(n.id)}"><rect x="${p.x}" y="${p.y}" width="145" height="67" rx="8" fill="${palette[n.type]}" stroke="#d3dfca"/><text x="${p.x+11}" y="${p.y+23}" fill="#46633c" font-size="9" font-family="Segoe UI,sans-serif">${chunks.slice(0,3).map((t,i) => `<tspan x="${p.x+11}" dy="${i?14:0}">${esc(t.trim())}${i===2&&chunks.length>3?'…':''}</tspan>`).join('')}</text><title>${esc(n.label)}</title></g>`;});
  return svg + '</svg>';
}
async function graphPage() {
  main.innerHTML = heading('The connections behind the check.', 'Live relationships from FalkorDB. Select any node to inspect its evidence.') + graphNotice() + '<div class="loading-panel">Reading graph relationships…</div>';
  try {
    const data = await api('graph');
    if (state.route !== 'graph') return;
    main.innerHTML = heading('The connections behind the check.', `${data.nodes.length} nodes · ${data.edges.length} relationships · your workspace only`, '<button data-action="export-graph">↓ Export graph</button>') + (data.nodes.length ? `<div class="graph-canvas">${diagramSVG(data)}</div><div class="graph-legend"><span><i class="legend-dot" style="background:#a4bf8a"></i>Function & contract</span><span><i class="legend-dot" style="background:#d4a68a"></i>Incident evidence</span><span><i class="legend-dot" style="background:#7da76b"></i>Regression case</span><span>Arrows show stored relationships</span></div><div class="graph-detail" id="graph-detail"><h3>Select a node</h3><p>Inspect its full label and the relationships connecting it to your incident memory.</p></div>` : '<div class="empty-state"><h2>Your graph is ready for its first lesson.</h2><p>Load the examples to explore their relationships.</p><button class="primary" data-action="seed">Load example incidents</button></div>');
    state.graph = data;
  } catch(error) { if(state.route==='graph') main.innerHTML = heading('Knowledge graph','A real connection is required.') + `<div class="notice error">${esc(error.message)}</div>`; }
}
function historyPage() {
  const records = getHistory();
  return heading('Every change has a trail.', 'Analysis history is saved in this browser. Export reports to keep a portable copy.') + (records.length ? `<section class="panel">${records.map(r => `<div class="history-row"><div><strong>${esc(r.title)}</strong><small>${esc(new Date(r.created).toLocaleString())} · ${esc(r.service)} · ${r.cases.length} incident check(s)</small></div><div class="button-row">${badge(r.results ? 'Executed' : 'Analyzed',r.results?'':'neutral')}<button data-action="open-history" data-id="${esc(r.id)}">Open analysis →</button></div></div>`).join('')}</section>` : '<div class="empty-state"><h2>No changes analyzed yet.</h2><p>Try a scenario to see its evidence and test results here.</p><button class="primary" data-action="demo" data-id="payment-contract">Try the demo →</button></div>');
}

const tourSteps = [
  {title:'An incident becomes a lesson.', description:'A subscription renewal failed because a payment field disappeared. Record what happened and the exact behavior that should have been preserved.', art:'<div class="art-document"><small>POSTMORTEM · INC-001</small><strong>Renewals failed</strong><div class="art-line"></div><div class="art-line short"></div><div class="art-error" style="margin-top:12px">Missing: payment_id</div></div>'},
  {title:'FalkorDB connects the evidence.', description:'The incident is linked to the payment function, its response contract, and the check that would have caught it. The lesson survives the next session.', art:'<div class="art-document"><small>FUNCTION</small><strong>create_payment()</strong></div><span class="mini-arrow">↔</span><div class="art-document"><small>CONTRACT</small><strong>Keep payment_id</strong><div class="art-line"></div></div>'},
  {title:'A new change touches the same contract.', description:'A developer renames payment_id to id. Ordinary tests still pass because they only check that payment processing succeeded.', art:'<div class="art-code">def create_payment(amount):<del>− "payment_id": "pay_123"</del><ins>+ "id": "pay_123"</ins></div>'},
  {title:'The agent retrieves the old lesson.', description:'RecurTrace follows the function → contract ← incident path. It shows the source, then builds a check using the confirmed expected behavior.', art:'<div class="art-document"><small>RETRIEVED FROM THE GRAPH</small><strong>INC-001: Renewal failure</strong><div class="art-line"></div><div class="art-line short"></div></div><span class="mini-arrow">→</span><div class="badge">1 check selected</div>'},
  {title:'The missing test catches the repeat.', description:'Run real Python in your browser. The proposed change passes existing checks but fails when the incident-derived test asks for payment_id.', art:'<div class="art-document"><small>PROPOSED CHANGE</small><strong>Existing checks: PASS</strong><div class="art-error" style="margin-top:12px">Regression check: FAIL</div></div>'},
  {title:'Verify the fix. Keep the memory.', description:'Restore the compatible response, run the same check, and see it pass. Export the test into your project so the lesson becomes lasting coverage.', art:'<div class="art-document"><small>CORRECTED CHANGE</small><strong>payment_id preserved</strong><div class="badge" style="margin-top:12px">Regression check: PASS</div><div class="art-line short"></div></div>'},
];
function walkthroughPage() {
  return heading('From “we fixed this” to “we test this.”', 'A visual walkthrough of RecurTrace, using the payment example.', '<button class="primary" data-action="demo" data-id="payment-contract">Try this exact story →</button>') + '<div class="notice">The example is fictional. The graph queries and Python test execution in the working demo are real.</div>' + `<div class="tour-nav" aria-label="Walkthrough steps">${tourSteps.map((_,i) => `<button data-action="tour-step" data-step="${i}" class="${i===state.tour?'active':''}" aria-label="Show step ${i+1}">${i+1}</button>`).join('')}<button data-action="tour-next">Next step →</button></div><div class="tour-grid">${tourSteps.map((s,i) => `<section id="tour-${i}" class="tour-card ${i===state.tour?'tour-focus':''}"><div class="step-number">STEP 0${i+1} / 06</div><div class="tour-art">${s.art}</div><h2>${esc(s.title)}</h2><p>${esc(s.description)}</p></section>`).join('')}</div><section class="panel wide-panel"><h2>What this proves</h2><p>The remembered incident changes which test is run. The test exposes a concrete regression. The corrected implementation passes the same assertion.</p><p>No stored incident means a coverage gap, not a guarantee of safety.</p></section>`;
}
function settingsPage() {
  return heading('Simple setup. Honest connections.', 'The complete local demo works without an AI key. Hosting stays on explicitly free plans.') + `<div class="settings-grid"><section class="panel"><h2>Current connections</h2><div class="settings-list"><div class="settings-row"><strong>FalkorDB graph</strong>${badge(state.health.graph === 'connected'?'Connected':'Offline',state.health.graph === 'connected'?'':'red')}</div><div class="settings-row"><strong>AI incident extraction</strong>${badge(state.health.ai?'Configured':'Not configured','neutral')}</div><div class="settings-row"><strong>Python execution</strong><span>Pyodide · in your browser</span></div><div class="settings-row"><strong>Analysis history</strong><span>This browser · last 20 analyses</span></div><div class="settings-row"><strong>Workspace</strong><span>${state.health.public_demo?'Private browser session':'Local workspace'}</span></div></div><button data-action="refresh">Refresh connection status</button></section><section class="panel"><h2>What runs without paid services?</h2><p>Every included example: graph retrieval, test generation from confirmed facts, original / proposed / corrected comparisons, graph visualization, and report downloads.</p><p>AI-assisted report extraction is optional and disabled by default. Configure a compatible provider in your private server environment if you have suitable access.</p><div class="notice" style="margin-top:18px">The no-key workflow is explicitly labeled deterministic. It never pretends to be a live model.</div></section></div><section class="panel wide-panel"><h2>Free hosting setup</h2><ol class="setup-steps"><li>Create a free <a href="https://github.com/signup" target="_blank" rel="noreferrer">GitHub account</a>, create a repository, and upload the project files. Exclude <code>.env</code>, <code>.venv</code>, and runtime data.</li><li>Create a <a href="https://app.falkordb.cloud/" target="_blank" rel="noreferrer">FalkorDB Cloud account</a>. Select only an explicitly free instance. Check its connection, persistence, and TLS options before entering data. Use synthetic examples for the public demo.</li><li>Create a free <a href="https://dashboard.render.com/" target="_blank" rel="noreferrer">Render account</a>, connect the repository, and use its <code>render.yaml</code> Blueprint. Verify the web service plan is <strong>Free</strong>.</li><li>Enter the FalkorDB host, port, username/password if provided, and SSL setting in Render's environment settings. Keep <code>ENABLE_AI=false</code> and use the generated session secret.</li><li>Deploy, open the app, load the examples, and verify all three comparisons. The free web service may need time to wake after inactivity.</li></ol><p>There is no paid sandbox, persistent disk, paid database, custom domain, or paid AI requirement. If a provider requires a paid upgrade, stop and keep the local demo.</p></section><section class="panel wide-panel"><h2>Data & limitations</h2><p>Incident memory is stored in FalkorDB. Analysis history and test results stay in this browser. Export important data; free hosting does not imply guaranteed backups. Public workspaces use a private browser session rather than a login; clearing cookies loses access to that workspace.</p><p>Code is sent to the backend for syntax and change analysis, then executed only in a separate, restricted browser frame. Browser test output is not trusted CI certification. Top-level standard-library Python functions are the supported scope.</p></section>`;
}

function render() {
  state.route = location.hash.slice(1) || 'overview';
  if (!titles[state.route]) state.route = 'overview';
  $('#breadcrumb').textContent = titles[state.route];
  document.title = `${titles[state.route]} · RecurTrace`;
  document.querySelectorAll('[data-nav]').forEach(a => {a.classList.toggle('active',a.dataset.nav === state.route); if(a.dataset.nav===state.route)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  if (state.route === 'graph') { graphPage(); return; }
  const pages = {overview, analyze:analyzePage, memory:memoryPage, history:historyPage, walkthrough:walkthroughPage, settings:settingsPage};
  main.innerHTML = pages[state.route]();
  lockInputs();
}
function go(route) { if(location.hash === '#'+route) render(); else location.hash = route; }
async function seed() { const result = await post('seed'); state.incidents = result.incidents; updateStatus(); }
async function selectExample(id) {
  const ex = state.examples.find(x => x.id === id) || state.examples[0];
  if (!ex) return;
  await seed(); state.selected = ex; state.analysis = null; state.results = null; go('analyze');
}

function openIncidentDialog(draft = null) {
  const dialog = $('#incident-dialog');
  const d = draft || {title:'',service:'payments',feature:'',function:'',summary:'',contract:'',severity:'high',source:'User-provided incident report',cases:[{name:'Expected behavior is preserved',function:'your_function',args:[],assertion:'equals',expected:null}]};
  dialog.innerHTML = `<div class="dialog-heading"><div><div class="eyebrow">ADD TO GRAPH MEMORY</div><h2 id="incident-dialog-title">Capture a lesson.</h2></div><button data-action="close-dialog" aria-label="Close dialog">×</button></div><p>Confirm the facts and test expectations before saving. Nothing is inferred silently.</p><div class="button-row" style="margin-bottom:15px"><label class="button" for="incident-upload">↑ Import JSON or report</label><input id="incident-upload" type="file" accept=".json,.txt,.md" class="file-input" style="max-width:210px"></div><details><summary style="font-size:11px;cursor:pointer">Extract a draft from a written report ${state.health.ai?'':'(AI not configured)'}</summary><div class="field" style="margin-top:12px"><label for="raw-report">Incident report</label><textarea id="raw-report" maxlength="12000" placeholder="Describe what failed, the affected function, and the expected behavior…"></textarea></div><button type="button" data-action="extract" ${state.health.ai?'':'disabled'}>Extract draft for review</button><p class="form-help">Requires an explicitly enabled AI provider. The report is sent to that provider only when you click Extract.</p></details><hr style="border:0;border-top:1px solid var(--line);margin:18px 0"><form id="incident-form"><div class="field"><label for="incident-title">Incident title</label><input id="incident-title" name="title" required minlength="5" maxlength="140" value="${esc(d.title)}"></div><div class="two-col"><div class="field"><label for="incident-service">Service</label><input id="incident-service" name="service" required value="${esc(d.service)}" maxlength="80"></div><div class="field"><label for="incident-function">Affected function</label><input id="incident-function" name="function" required pattern="[a-zA-Z][a-zA-Z0-9_]*" value="${esc(d.function)}" placeholder="create_payment"></div></div><div class="two-col"><div class="field"><label for="incident-feature">Affected feature</label><input id="incident-feature" name="feature" required maxlength="100" value="${esc(d.feature)}"></div><div class="field"><label for="incident-severity">Impact</label><select id="incident-severity" name="severity">${['high','medium','low'].map(s=>`<option ${s===d.severity?'selected':''}>${s}</option>`).join('')}</select></div></div><div class="field"><label for="incident-summary">What happened?</label><textarea id="incident-summary" name="summary" required minlength="15" maxlength="5000">${esc(d.summary)}</textarea></div><div class="field"><label for="incident-contract">Confirmed expected behavior</label><textarea id="incident-contract" name="contract" required minlength="10" maxlength="1500">${esc(d.contract)}</textarea></div><div class="field"><label for="incident-source">Evidence source</label><input id="incident-source" name="source" required maxlength="300" value="${esc(d.source)}"></div><div class="field"><label for="incident-cases">Regression cases (JSON)</label><textarea id="incident-cases" class="mono-input" name="cases" required maxlength="30000">${esc(JSON.stringify(d.cases,null,2))}</textarea><p class="form-help">Assertions: equals, contains_key, length, or raises. Use factual expected values. Each function must match the affected function above.</p></div><div id="incident-error" role="alert"></div><div class="button-row"><button class="primary" type="submit">Confirm facts & save to graph</button><button type="button" data-action="close-dialog">Cancel</button></div></form>`;
  if (!dialog.open) dialog.showModal();
}

async function runBrowserCode(source, baseline, regression, progress) {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe'); frame.className='runner-frame'; frame.title='Isolated Python test runner'; frame.setAttribute('sandbox','allow-scripts'); frame.src='/static/runner.html';
    const token = crypto.randomUUID(); let timer;
    function cleanup() {clearTimeout(timer);window.removeEventListener('message', onMessage);frame.remove();}
    function timeout(ms, message) {clearTimeout(timer);timer=setTimeout(()=>{cleanup();reject(new Error(message));},ms);}
    function onMessage(event) {
      if(event.source !== frame.contentWindow) return;
      const message=event.data;
      if(message?.type === 'ready') { frame.contentWindow.postMessage({type:'run',token,source,baseline,regression},'*'); return; }
      if(message?.token !== token) return;
      if(message.type === 'progress') {progress(message.text); if(message.phase==='execute') timeout(15000,'Execution stopped after exceeding its time limit.');}
      if(message.type === 'result') {cleanup();resolve(message.result);}
      if(message.type === 'error') {cleanup();reject(new Error(message.error));}
    }
    window.addEventListener('message',onMessage); timeout(120000,'Python could not load within two minutes. Check your internet connection and retry.'); document.body.appendChild(frame);
  });
}
async function executeChecks(includeFix) {
  if(state.busy || !state.analysis) return;
  state.busy=true; state.results=null;
  lockInputs();
  const analysis=state.analysis;
  const versions=[{version:'original',source:analysis.before},{version:'proposed',source:analysis.after}];
  if(includeFix && state.selected) versions.push({version:'corrected',source:state.selected.fixed});
  $('#analysis-result').innerHTML=resultsView();
  const results=[];
  for(const item of versions) {
    const progress=text=>{ const el=$('#runner-progress');if(el)el.innerHTML=`<p class="progress-line"><span class="busy-dot"></span>${esc(item.version)}: ${esc(text)}</p>`; };
    progress('Starting isolated Python runner…');
    try { const result=await runBrowserCode(item.source,analysis.baseline_cases,analysis.cases,progress);results.push({version:item.version,...result}); }
    catch(error) {results.push({version:item.version,error:error.message,baseline:[],regression:[]});}
  }
  state.results=results;state.busy=false;saveHistory();
  lockInputs();
  if(state.route==='analyze') $('#analysis-result').innerHTML=resultsView();
  toast(results.some(r=>r.error)?'A runner error occurred. Review the details; no result was simulated.':'Python checks finished. Results saved in this browser.');
}

document.addEventListener('click',async event=>{
  const node=event.target.closest('[data-node]');
  if(node && state.graph) {const n=state.graph.nodes.find(x=>x.id===node.dataset.node);const edges=state.graph.edges.filter(e=>e.source===n.id||e.target===n.id);$('#graph-detail').innerHTML=`<h3>${esc(n.type)} · ${esc(n.label)}</h3><p>${edges.map(e=>{const other=state.graph.nodes.find(x=>x.id===(e.source===n.id?e.target:e.source));return `${esc(e.label)} ${e.source===n.id?'→':'←'} ${esc(other?.label)}`;}).join('<br>')}</p>`;return;}
  const button=event.target.closest('[data-action]');if(!button)return;
  const action=button.dataset.action;
  if(state.busy && ['demo','new-analysis','load-first','open-history','run','compare'].includes(action)) {toast('Wait for the current operation to finish.');return;}
  try {
    if(action==='demo'){button.disabled=true;await selectExample(button.dataset.id);}
    if(action==='load-first') await selectExample('payment-contract');
    if(action==='new-analysis'){state.analysis=null;state.results=null;state.selected=null;go('analyze');}
    if(action==='seed'){button.disabled=true;await seed();render();toast('Three demo lessons are ready in FalkorDB.');}
    if(action==='refresh'){await refresh();render();toast('Connection status refreshed.');}
    if(action==='add-incident'){state.importQueue=[];openIncidentDialog();}
    if(action==='close-dialog'){state.importQueue=[];$('#incident-dialog').close();}
    if(action==='view-incident'){const item=state.incidents.find(i=>i.id===button.dataset.id);download('incident-'+item.id+'.json',JSON.stringify(item,null,2));}
    if(action==='delete-incident'){
      if(button.dataset.confirm!=='yes'){button.dataset.confirm='yes';button.textContent='Confirm removal';return;}
      await api('incidents/'+encodeURIComponent(button.dataset.id),{method:'DELETE'});await refresh();render();toast('Incident removed from future retrieval. Previous reports remain historical snapshots.');
    }
    if(action==='export-memory')download('recurtrace-incidents.json',JSON.stringify(state.incidents,null,2));
    if(action==='export-graph')download('recurtrace-graph.json',JSON.stringify(state.graph,null,2));
    if(action==='download-test')download('test_incident_regressions.py',state.analysis.test_code,'text/x-python');
    if(action==='download-report')download('recurtrace-analysis.json',JSON.stringify({...state.analysis,results:state.results},null,2));
    if(action==='run')await executeChecks(false);
    if(action==='compare')await executeChecks(true);
    if(action==='agent-review'){
      if(state.busy)return;
      state.busy=true;button.disabled=true;button.textContent='Reviewing…';
      lockInputs();
      const analysis=state.analysis;
      try{const review=await post('agent-review',analysis);analysis.ai_review=review;saveHistory();if(state.route==='analyze'&&state.analysis===analysis){state.busy=false;$('#analysis-result').innerHTML=resultsView();}toast('AI review completed using retrieved graph evidence.');}
      finally{state.busy=false;lockInputs();if(button.isConnected)button.textContent='Ask the agent →';}
    }
    if(action==='open-history'){const h=getHistory().find(x=>x.id===button.dataset.id);state.analysis=h;state.results=h.results;state.selected=state.examples.find(x=>x.id===h.example_id)||null;go('analyze');}
    if(action==='tour-step'||action==='tour-next'){state.tour=action==='tour-next'?(state.tour+1)%6:Number(button.dataset.step);render();$('#tour-'+state.tour).scrollIntoView({behavior:'smooth',block:'center'});}
    if(action==='extract'){button.disabled=true;button.textContent='Extracting draft…';const data=await post('extract-incident',{report:$('#raw-report').value});openIncidentDialog(data.draft);toast('Draft extracted. Review every fact and expectation before saving.');}
  }catch(error){toast(error.message);}finally{if(button.isConnected){button.disabled=false;if(action==='extract')button.textContent='Extract draft for review';}}
});
document.addEventListener('keydown',event=>{if(event.target.matches('[data-node]') && ['Enter',' '].includes(event.key)){event.preventDefault();event.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}});
document.addEventListener('input',event=>{
  if(event.target.id==='incident-search'){const q=event.target.value.toLowerCase();$('#incident-list').innerHTML=incidentCards(state.incidents.filter(i=>[i.title,i.function,i.feature,i.summary].join(' ').toLowerCase().includes(q)));}
  if(['before-code','after-code','service','change-title'].includes(event.target.id) && state.analysis && !state.busy){state.analysis=null;state.results=null;$('#analysis-result').innerHTML='<div class="notice warning" style="margin-top:20px">The input changed. Trace this change again before running checks.</div>';}
});
document.addEventListener('change',async event=>{
  if(event.target.id!=='incident-upload')return;
  const file=event.target.files[0];if(!file)return;
  if(file.size>30000){toast('Please use a report smaller than 30 KB.');return;}
  try{const content=await file.text();if(file.name.endsWith('.json')){const data=JSON.parse(content);const records=Array.isArray(data)?data:[data];if(!records.length||records.length>50||records.some(x=>!x||typeof x.title!=='string'||!Array.isArray(x.cases))){throw new Error('Invalid incident records');}state.importQueue=records.slice(1);openIncidentDialog(records[0]);toast(`Review this incident before saving. ${state.importQueue.length} more queued for review.`);}else{$('#raw-report').value=content;$('#raw-report').closest('details').open=true;toast('Report loaded. Extract a draft if AI is configured, or fill in the confirmed facts below.');}}catch{toast('That file could not be imported. Use a valid incident JSON object, an exported incident list, or a text report.');}
});
document.addEventListener('submit',async event=>{
  if(event.target.id==='analysis-form'){
    event.preventDefault();if(state.busy)return;state.busy=true;const button=event.submitter;button.disabled=true;button.textContent='Tracing evidence…';
    try{const data=Object.fromEntries(new FormData(event.target));data.baseline_cases=state.selected?.baseline_cases||[];state.analysis=await post('analyze',data);state.results=null;state.busy=false;saveHistory();$('#analysis-result').innerHTML=resultsView();$('#analysis-result').scrollIntoView({behavior:'smooth',block:'start'});}
    catch(error){toast(error.message);}finally{state.busy=false;button.disabled=false;button.textContent='Trace this change →';}
  }
  if(event.target.id==='incident-form'){
    event.preventDefault();const button=event.submitter;button.disabled=true;
    try{const data=Object.fromEntries(new FormData(event.target));data.cases=JSON.parse(data.cases);await post('incidents',data);await refresh();render();if(state.importQueue.length){openIncidentDialog(state.importQueue.shift());toast(`Lesson saved. Review the next incident; ${state.importQueue.length} more queued.`);}else{$('#incident-dialog').close();toast('Lesson saved. Future analyses can now retrieve it.');}}
    catch(error){$('#incident-error').innerHTML=`<div class="notice error">${esc(error.message)}</div>`;}finally{button.disabled=false;}
  }
});
window.addEventListener('hashchange',()=>{render();window.scrollTo(0,0);});
(async()=>{try{state.examples=await api('examples');await refresh();render();}catch(error){main.innerHTML=`<div class="notice error">${esc(error.message)}</div><button data-action="refresh">Retry connection</button>`;}})();
