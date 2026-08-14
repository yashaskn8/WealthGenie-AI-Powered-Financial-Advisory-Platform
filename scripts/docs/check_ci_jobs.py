import urllib.request
import json

url = 'https://api.github.com/repos/yashaskn8/WealthGenie-AI-Powered-Financial-Advisory-Platform/actions/runs/31808014124/jobs'
req = urllib.request.Request(url, headers={'User-Agent': 'WealthGenie-DevOps'})
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode())
    for job in data.get('jobs', []):
        print(f"Job: {job['name']} | Status: {job['status']} | Conclusion: {job['conclusion']}")
