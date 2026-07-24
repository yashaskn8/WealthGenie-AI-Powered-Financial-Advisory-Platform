# GitHub Branch Protection Specification

## Target Branch: `main`

The `main` branch is protected with strict status checks and code review requirements.

### Enforced Status Checks (Must Pass Before Merge)
1. `Secret Scanning Gate`
2. `Documentation Sync Gate`
3. `Backend Linux (Node 20.x, Mongo 7.0)`
4. `Backend Windows (Node 20.x)`
5. `Frontend (Node 20.x, ubuntu-latest)`
6. `ML Service (Python 3.12, ubuntu-latest)`

### Protection Settings Configuration

```json
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "Secret Scanning Gate",
      "Documentation Sync Gate",
      "Backend Linux (Node 20.x, Mongo 7.0)",
      "Backend Windows (Node 20.x)",
      "Frontend (Node 20.x, ubuntu-latest)",
      "ML Service (Python 3.12, ubuntu-latest)"
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1
  },
  "allow_force_pushes": false,
  "allow_deletions": false
}
```
