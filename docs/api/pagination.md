# API Pagination, Filtering & Sorting Specification — Task 5

## Overview
WealthGenie standardizes list endpoints (`/api/goals`, `/api/instruments`) on **Offset-based Pagination** with query parameters for limits, offsets, sorting, and field filtering.

## Query Parameters

| Parameter | Type | Default | Constraint | Example | Description |
|:---|:---:|:---:|:---:|:---|:---|
| `limit` | Integer | `20` | `1` to `100` | `?limit=10` | Maximum items per page |
| `offset` | Integer | `0` | `≥ 0` | `?offset=20` | Number of items to skip |
| `sort` | String | `-createdAt` | Enum | `?sort=target_amount` | Field sorting (`-` for descending) |
| `category` | String | `all` | String | `?category=Equity` | Filter by category |

## Canonical Paginated Response

```json
{
  "success": true,
  "data": [ ... ],
  "pagination": {
    "total": 45,
    "limit": 20,
    "offset": 0,
    "hasMore": true
  },
  "requestId": "req_987654321",
  "timestamp": "2026-07-25T00:00:00.000Z"
}
```
