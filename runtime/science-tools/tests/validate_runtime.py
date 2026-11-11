"""Real, relocatable runtime checks. Fixtures are owned by each product commit."""
import hashlib
import json
import math
import os
from pathlib import Path
import resource
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]


def verify():
    manifest=json.loads((ROOT/'runtime-manifest.json').read_text())
    assert manifest['schema']=='confenge.science-runtime/v1'
    assert manifest['triangle_included'] is False
    assert manifest['requirements_sha256']==hashlib.sha256((ROOT/'requirements.lock').read_bytes()).hexdigest()
    site=ROOT/'python/lib/python3.12/site-packages'
    assert not list(site.glob('*triangle*'))
    for patch in manifest['patches']:
        assert hashlib.sha256((site/patch['path']).read_bytes()).hexdigest()==patch['modified_sha256']
    checks=[]
    for file in sorted((ROOT/'tests/cases').glob('*.json')):
        for case in json.loads(file.read_text()):
            with tempfile.TemporaryDirectory(prefix='confenge-science-test-') as directory:
                env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8','LC_ALL':'C.UTF-8','MPLBACKEND':'Agg','MPLCONFIGDIR':directory,'NUMBA_CACHE_DIR':directory,'TMPDIR':directory,'OPENBLAS_NUM_THREADS':'1','MKL_NUM_THREADS':'1','OMP_NUM_THREADS':'1','NUMBA_NUM_THREADS':'1'}
                before=resource.getrusage(resource.RUSAGE_CHILDREN); start=time.monotonic()
                completed=subprocess.run([str(ROOT/'python/bin/python3.12'),'-I','-B',str(ROOT/'worker.py')],input=json.dumps(case['request']),text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,cwd=directory,env=env,timeout=24)
                elapsed=time.monotonic()-start; after=resource.getrusage(resource.RUSAGE_CHILDREN)
                assert completed.returncode==0,(case['name'],completed.returncode,completed.stderr[-1000:])
                result=json.loads(completed.stdout)
                if case.get('invalid'):
                    assert result.get('ok') is False,(case['name'],result)
                else:
                    assert result.get('ok') is True,(case['name'],result)
                    for check in case.get('summary',[]):
                        value=result['result']['summary'][check['index']]['value']
                        if 'value' in check: assert math.isclose(value,check['value'],rel_tol=check.get('rel',1e-7),abs_tol=check.get('abs',1e-8)),(case['name'],check,value)
                        if 'min' in check: assert value>=check['min'],(case['name'],check,value)
                        if 'max' in check: assert value<=check['max'],(case['name'],check,value)
                    assert all(table['rows'] for table in result['result']['tables'])
                checks.append({'name':case['name'],'seconds':round(elapsed,3),'cpu_seconds':round(after.ru_utime+after.ru_stime-before.ru_utime-before.ru_stime,3),'peak_child_rss_kib':after.ru_maxrss,'passed':True})
                print(json.dumps(checks[-1]),flush=True)
    print(json.dumps({'checks':len(checks),'all_passed':True,'runtime':str(ROOT)}))


if __name__=='__main__': verify()
