# Cross-User Authorization Matrix

| Route | Owner Check | Test Exists | Pass | Fail | Coverage % |
|:---|:---|:---:|:---:|:---:|:---:|
| `POST /api/profile/build` | `userId: req.user.userId` attached on create | Yes | Yes | No | 100% |
| `GET /api/profile/me` | `findOne({ userId: req.user.userId })` | Yes | Yes | No | 100% |
| `PUT /api/profile/:id` | `findOne({ _id: id, userId: req.user.userId })` | Yes | Yes | No | 100% |
| `GET /api/goals` | `find({ userId: req.user.userId })` | Yes | Yes | No | 100% |
| `POST /api/goals` | `userId: req.user.userId` attached on create | Yes | Yes | No | 100% |
| `PATCH /api/goals/:id` | `findOneAndUpdate({ _id: id, userId: req.user.userId })` | Yes | Yes | No | 100% |
| `DELETE /api/goals/:id` | `findOneAndDelete({ _id: id, userId: req.user.userId })` | Yes | Yes | No | 100% |
| `PATCH /api/goals/:id/refresh-advice` | `findOne({ _id: id, userId: req.user.userId })` | Yes | Yes | No | 100% |
| `POST /api/recommend` | `findOne({ _id: profileId, userId: req.user.userId })` | Yes | Yes | No | 100% |
| `POST /api/recommend/weights` | `findOne({ _id: profileId, userId: req.user.userId })` | Yes | Yes | No | 100% |
| `POST /api/projection` | `findOne({ _id: profileId, userId: req.user.userId })` | Yes | Yes | No | 100% |
| `POST /api/montecarlo` | `findOne({ _id: profileId, userId: req.user.userId })` | Yes | Yes | No | 100% |
| `POST /api/portfolio/optimise` | `findOne({ _id: profileId, userId: req.user.userId })` | Yes | Yes | No | 100% |

**Total Tested Routes**: 13  
**Pass Count**: 13  
**Fail Count**: 0  
**Overall Authorization Coverage**: 100%  
