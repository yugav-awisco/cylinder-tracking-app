const express = require('express');
const router = express.Router();
const pool = require('../db'); // adjust path if your DB connection is elsewhere

// GET /cylinder-types?branchId=1
router.get('/', async (req, res) => {
  const { branchId } = req.query;

  if (!branchId) {
    return res.status(400).json({ error: 'Missing branchId' });
  }

  try {
    const result = await pool.query(`
      SELECT ct.id, ct.label, cg.name AS group
      FROM branch_cylinder_types bct
      JOIN cylinder_types ct ON bct.type_id = ct.id
      JOIN cylinder_groups cg ON ct.group_id = cg.id
      WHERE bct.branch_id = $1
    `, [branchId]);

    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error fetching cylinder types:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

