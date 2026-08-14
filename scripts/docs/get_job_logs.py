import urllib.request
import json

job_id = 90729739572 # Let us query job id from run
run_id = 31805399362
url = f'https://api.github.com/repos/yashaskn8/WealthGenie-AI-Powered-Financial-Advisory-Platform/actions/runs/{run_id}/jobs'
req = urllib.request.Request(url, headers={'User-Agent': 'WealthGenie-DevOps'})
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode())
    job = data['jobs'][0]
    job_id = job['id']
    print(f"Job ID: {job_id}")

log_url = f'https://api.github.com/repos/yashaskn8/WealthGenie-AI-Powered-Financial-Advisory-Platform/actions/jobs/{job_id}/logs'
log_req = urllib.request.Request(log_url, headers={'User-Agent': 'WealthGenie-DevOps'})
try:
    with urllib.request.urlopen(log_req) as resp:
        content = resp.read().decode('utf-8', errors='ignore')
        # print last 100 lines
        lines = content.splitlines()
        for line in lines[-120:]:
            print(line)
except Exception as e:
    print('Error fetching logs:', e)
