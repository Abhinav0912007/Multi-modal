import urllib.request
import json
import time

req = urllib.request.Request(
    'http://127.0.0.1:8000/api/v1/registration/jobs',
    data=json.dumps({'pair_id': 'pair_001', 'transform_type': 'homography'}).encode(),
    headers={'Content-Type': 'application/json'},
    method='POST'
)
res = urllib.request.urlopen(req)
d = json.loads(res.read().decode())
print('Submitted job:', d)
job_id = d['job_id']

for i in range(20):
    time.sleep(1)
    status_res = urllib.request.urlopen(f'http://127.0.0.1:8000/api/v1/jobs/{job_id}')
    status = json.loads(status_res.read().decode())
    print(f"[{i+1}s] Step {status.get('current_step')}/10 ({status.get('progress')}%): {status.get('step_message')} - Status: {status.get('status')}")
    if status.get('status') in ('completed', 'failed'):
        print('Final metrics:', status.get('metrics'))
        break

# Verify list_all_jobs
list_res = urllib.request.urlopen('http://127.0.0.1:8000/api/v1/jobs')
jobs = json.loads(list_res.read().decode())
print(f"Total historical jobs in DB: {len(jobs)}")
print("Latest job summary:", json.dumps(jobs[0], indent=2))
