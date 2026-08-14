import urllib.request
import json

url = 'https://api.github.com/repos/yashaskn8/WealthGenie-AI-Powered-Financial-Advisory-Platform/actions/runs/31810810022/jobs'
req = urllib.request.Request(url, headers={'User-Agent': 'WealthGenie-DevOps'})
try:
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode())
        for job in data.get('jobs', []):
            print(f"Job: {job['name']} | Status: {job['status']} | Conclusion: {job['conclusion']}")
except Exception as e:
    print('Error checking job:', e)
