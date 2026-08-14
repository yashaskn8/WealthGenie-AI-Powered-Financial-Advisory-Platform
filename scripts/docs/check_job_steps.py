import urllib.request
import json

run_id = 31815714918
url = f'https://api.github.com/repos/yashaskn8/WealthGenie-AI-Powered-Financial-Advisory-Platform/actions/runs/{run_id}/jobs'
req = urllib.request.Request(url, headers={'User-Agent': 'WealthGenie-DevOps'})
try:
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode())
        for job in data.get('jobs', []):
            print(f"Job: {job['name']} | Status: {job['status']} | Conclusion: {job['conclusion']}")
            for step in job.get('steps', []):
                print(f"  - Step: {step['name']} | Status: {step['status']} | Conclusion: {step['conclusion']}")
except Exception as e:
    print('Error checking job:', e)
