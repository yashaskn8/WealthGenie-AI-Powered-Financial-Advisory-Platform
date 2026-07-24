# GitHub Actions Workflow Specification & Security Policy

## Permissions
The workflow enforces least-privilege permissions at the top level:

```yaml
permissions:
  contents: read
```

## Concurrency Control
Prevents wasteful resource consumption by automatically canceling outdated workflow runs on new commits:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

## Dependency Caching Policy
- **npm cache**: `cache: 'npm'` using `server/package-lock.json` & `reactapp/package-lock.json`.
- **pip cache**: `cache: 'pip'` using `ml-service/requirements.txt`.

## Artifact Storage Policy
All benchmark metrics (`.json`, `.csv`, `.svg`) and markdown summaries (`.md`) are automatically attached to every CI run via `actions/upload-artifact@v4`.
