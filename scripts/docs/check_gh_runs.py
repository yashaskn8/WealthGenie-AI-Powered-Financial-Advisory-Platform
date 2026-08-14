import urllib.request
import json

url = 'https://api.github.com/repos/yashaskn8/WealthGenie-AI-Powered-Financial-Advisory-Platform/actions/runs'
req = urllib.request.Request(url, headers={'User-Agent': 'WealthGenie-DevOps'})
try:
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode())
        print('Total runs found:', data.get('total_count', 0))
        for run in data.get('workflow_runs', [])[:5]:
            run_id = run['id']
            name = run['name']
            status = run['status']
            conclusion = run['conclusion']
            commit = run['head_sha'][:7]
            html_url = run['html_url']
            print(f"ID: {run_id} | Name: {name} | Status: {status} | Conclusion: {conclusion} | Commit: {commit} | URL: {html_url}")
except Exception as e:
    print('Error checking runs:', e)
