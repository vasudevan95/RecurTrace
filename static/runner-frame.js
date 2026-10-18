'use strict';
// This document is loaded in an opaque-origin iframe (allow-scripts only).
// It receives code, never application cookies, credentials, or graph access.
function workerMain() {
  self.onmessage = async event => {
    const payload = event.data;
    const send = message => self.postMessage(message);
    try {
      send({type:'progress',phase:'load',text:'Loading Python runtime (cached after the first run)…'});
      importScripts('https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js');
      const py = await loadPyodide({indexURL:'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/'});
      py.globals.set('_rt_payload', JSON.stringify(payload));
      send({type:'progress',phase:'execute',text:'Executing Python checks…'});
      const raw = await py.runPythonAsync(`
import json as _rt_json
import types as _rt_types
import contextlib as _rt_contextlib
import io as _rt_io
import unittest as _rt_unittest
import traceback as _rt_traceback
import time as _rt_time

def _rt_execute(payload):
    started = _rt_time.perf_counter()
    class CappedOutput(_rt_io.StringIO):
        def write(self, text):
            if self.tell() < 4000:
                return super().write(text[:4000 - self.tell()])
            return len(text)
    output = CappedOutput()
    module = _rt_types.ModuleType('candidate')
    result = {'baseline': [], 'regression': []}
    try:
        with _rt_contextlib.redirect_stdout(output), _rt_contextlib.redirect_stderr(output):
            exec(compile(payload['source'], 'candidate.py', 'exec'), module.__dict__)
    except BaseException as exc:
        return {'error': type(exc).__name__ + ': ' + str(exc)[:500], 'baseline': [], 'regression': []}
    for group in ('baseline', 'regression'):
        for case in payload[group]:
            check = _rt_unittest.TestCase()
            actual = None
            try:
                fn = getattr(module, case['function'])
                with _rt_contextlib.redirect_stdout(output), _rt_contextlib.redirect_stderr(output):
                    if case['assertion'] == 'raises':
                        with check.assertRaises(Exception) as caught:
                            fn(*case.get('args', []), **case.get('kwargs', {}))
                        actual = type(caught.exception).__name__
                        check.assertEqual(actual, case['expected'])
                    else:
                        actual = fn(*case.get('args', []), **case.get('kwargs', {}))
                        if case['assertion'] == 'contains_key':
                            check.assertIsInstance(actual, dict)
                            check.assertIn(case['expected'], actual)
                        elif case['assertion'] == 'length':
                            check.assertEqual(len(actual), case['expected'])
                        else:
                            check.assertEqual(actual, case['expected'])
                result[group].append({'name': case['name'], 'passed': True, 'detail': 'Assertion passed', 'actual': repr(actual)[:600]})
            except BaseException as exc:
                result[group].append({'name': case['name'], 'passed': False, 'detail': type(exc).__name__ + ': ' + str(exc)[:600], 'actual': repr(actual)[:600]})
    result['duration_ms'] = round((_rt_time.perf_counter() - started) * 1000, 2)
    result['stdout'] = output.getvalue()
    return result

_rt_json.dumps(_rt_execute(_rt_json.loads(_rt_payload)))
`);
      send({type:'result',result:JSON.parse(raw)});
    } catch(error) {send({type:'error',error:'Python runner: ' + String(error.message || error).slice(0,700)});}
  };
}
let started = false;
window.addEventListener('message',event=>{
  if(event.source!==parent || event.data?.type!=='run' || started)return;
  started=true;
  const {token,source,baseline,regression}=event.data;
  const target=event.origin;
  const send=message=>parent.postMessage({...message,token},target);
  const url=URL.createObjectURL(new Blob(['('+workerMain.toString()+')();'],{type:'text/javascript'}));
  const worker=new Worker(url);URL.revokeObjectURL(url);
  let deadline=setTimeout(()=>{worker.terminate();send({type:'error',error:'Python runtime could not load in time. Please retry.'});},110000);
  worker.onmessage=e=>{
    if(e.data?.phase==='execute'){clearTimeout(deadline);deadline=setTimeout(()=>{worker.terminate();send({type:'error',error:'Execution stopped: 12-second limit exceeded.'});},12000);}
    send(e.data);
    if(['result','error'].includes(e.data?.type)){clearTimeout(deadline);worker.terminate();}
  };
  worker.onerror=e=>{clearTimeout(deadline);worker.terminate();send({type:'error',error:e.message||'The isolated worker could not start.'});};
  worker.postMessage({source,baseline,regression});
});
parent.postMessage({type:'ready'},'*');
