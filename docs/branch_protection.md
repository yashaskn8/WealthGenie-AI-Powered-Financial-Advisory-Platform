# GitHub Branch Protection Specification

## Target Branch: `main`

The `main` branch is protected with strict status checks and code review requirements.

### Enforced Status Checks (Must Pass Before Merge)
1. `secret-scan-gate`
2. `docs-sync-gate`
3. `backend-quality-matrix (ubuntu-latest, 20.x, 7.0)`
4. `backend-quality-matrix (windows-latest, 22.x, 7.0)`
5. `frontend-quality-matrix (ubuntu-latest, 20.x)`
6. `ml-microservice-quality (ubuntu-latest, 3.12)`

### Protection Settings Configuration

```json
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "Secret Scanning Gate",
      "Documentation Sync Gate",
      "Backend (Node 20.x, MongoDB 7.0, ubuntu-latest)",
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
