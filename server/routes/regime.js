import express from 'express';
import { getCurrentRegime, getRegimeTilts, calculateTiltAdjustedAllocation } from '../services/regimeRotationEngine.js';
import { validate, validateQuery, regimeAdjustSchema, regimeQuerySchema } from '../validation/schemas.js';

const router = express.Router();

// GET /api/regime/current — returns active macro regime state
router.get('/current', validateQuery(regimeQuerySchema), (req, res) => {
  const override = req.query.regime || null;
  const current = getCurrentRegime(override);
  res.json(current);
});

// GET /api/regime/tilts — returns detailed tactical sector tilts
router.get('/tilts', validateQuery(regimeQuerySchema), (req, res) => {
  const regimeKey = req.query.regime || 'geopolitical_conflict';
  const tilts = getRegimeTilts(regimeKey);
  res.json(tilts);
});

// POST /api/regime/adjust — simulates tilt-adjusted portfolio allocation
router.post('/adjust', validate(regimeAdjustSchema), (req, res) => {
  const { baseWeights, regimeKey } = req.body || {};
  const result = calculateTiltAdjustedAllocation(baseWeights, regimeKey);
  res.json(result);
});

export default router;
