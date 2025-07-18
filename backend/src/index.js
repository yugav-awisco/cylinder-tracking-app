const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { Pool } = require("pg");

dotenv.config();
const app = express();

// Enhanced CORS configuration for Netlify + Render
const corsOptions = {
  origin: [
    'http://localhost:3000',
    'http://localhost:3001', 
    'http://localhost:5173',
    'https://cylinder-tracking-app.netlify.app',
    'https://awisco-cylinder-api.onrender.com'
  ],
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));
app.use(express.json());

// Add preflight handling for complex requests
app.options('*', cors(corsOptions));

// Log requests for debugging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path} from ${req.headers.origin || 'direct access'}`);
  next();
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

app.get("/", (req, res) => {
  res.send("API is running");
});

// Updated Auth Route - now returns user name from database
app.post("/auth", async (req, res) => {
  console.log(" Incoming /auth request:", req.body); // Debug

  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ message: "Access code is required." });
  }

  try {
    const result = await pool.query(
      "SELECT branch_id, user_name FROM access_codes WHERE code = $1 AND active = TRUE",
      [code]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Invalid or inactive access code." });
    }

    res.status(200).json({ 
      branchId: result.rows[0].branch_id,
      userName: result.rows[0].user_name || 'Unknown User'
    });
  } catch (err) {
    console.error(" Auth error:", err);
    res.status(500).json({ message: "Server error during authentication." });
  }
});

// Get all branches
app.get("/branches", async (req, res) => {
  try {
    const result = await pool.query("SELECT id, name FROM branches ORDER BY name");
    res.status(200).json(result.rows);
  } catch (err) {
    console.error(" Error fetching branches:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Updated GET /records endpoint - includes user info
app.get("/records", async (req, res) => {
  const { branchId, date } = req.query;

  if (!branchId || !date) {
    return res.status(400).json({error: "Missing branchId or date" });
  }

  try {
    const result = await pool.query(
      `SELECT 
         ir.id,
         ir.branch_id AS "branchId",
         ir.type_id AS "typeId",
         ct.label,
         ct.label AS "cylinderType",
         ir.full_count AS "fullCount",
         ir.empty_count AS "emptyCount",
         ir.created_at AS "submittedAt",
         ir.week_ending AS "weekEnding",
         b.name AS "branchName",
         cg.name AS "groupName",
         COALESCE(ac.user_name, 'Unknown User') AS "submittedBy"
       FROM inventory_records ir
       JOIN cylinder_types ct ON ir.type_id = ct.id
       JOIN branches b ON ir.branch_id = b.id
       JOIN cylinder_groups cg ON ct.group_id = cg.id
       LEFT JOIN access_codes ac ON ir.submitted_by_code = ac.code
       WHERE ir.branch_id = $1 AND ir.week_ending = $2
       ORDER BY ir.created_at DESC, cg.name, ct.label`,
      [branchId, date]
    );

    return res.status(200).json(result.rows);
  } catch (err) {
    console.error(" GET /records error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Updated GET /admin/records endpoint - includes user info
app.get("/admin/records", async (req, res) => {
  const { branchId, date, limit = 100 } = req.query;

  try {
    let query = `
      SELECT 
        ir.id,
        ir.branch_id AS "branchId",
        ir.type_id AS "typeId",
        ct.label,
        ct.label AS "cylinderType",
        ir.full_count AS "fullCount",
        ir.empty_count AS "emptyCount",
        ir.created_at AS "submittedAt",
        ir.week_ending AS "weekEnding",
        b.name AS "branchName",
        cg.name AS "groupName",
        COALESCE(ac.user_name, 'Unknown User') AS "submittedBy"
      FROM inventory_records ir
      JOIN cylinder_types ct ON ir.type_id = ct.id
      JOIN branches b ON ir.branch_id = b.id
      JOIN cylinder_groups cg ON ct.group_id = cg.id
      LEFT JOIN access_codes ac ON ir.submitted_by_code = ac.code
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 0;

    if (branchId) {
      paramCount++;
      query += ` AND ir.branch_id = $${paramCount}`;
      params.push(branchId);
    }

    if (date) {
      paramCount++;
      query += ` AND ir.week_ending = $${paramCount}`;
      params.push(date);
    }

    query += ` ORDER BY ir.created_at DESC, ir.week_ending DESC, b.name, cg.name, ct.label`;
    
    if (limit) {
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      params.push(parseInt(limit));
    }

    const result = await pool.query(query, params);

    return res.status(200).json(result.rows);
  } catch (err) {
    console.error(" GET /admin/records error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Get records summary/statistics
app.get("/admin/stats", async (req, res) => {
  try {
    const currentWeek = getCurrentWeekSunday();
    
    // Get total branches
    const branchesResult = await pool.query("SELECT COUNT(*) as total FROM branches");
    const totalBranches = parseInt(branchesResult.rows[0].total);

    // Get total submissions
    const submissionsResult = await pool.query("SELECT COUNT(*) as total FROM inventory_records");
    const totalSubmissions = parseInt(submissionsResult.rows[0].total);

    // Get this week's submissions
    const thisWeekResult = await pool.query(
      "SELECT COUNT(*) as total FROM inventory_records WHERE week_ending = $1",
      [currentWeek]
    );
    const thisWeek = parseInt(thisWeekResult.rows[0].total);

    // Get branches that submitted this week
    const submittedBranchesResult = await pool.query(
      "SELECT COUNT(DISTINCT branch_id) as total FROM inventory_records WHERE week_ending = $1",
      [currentWeek]
    );
    const submittedBranches = parseInt(submittedBranchesResult.rows[0].total);
    const pending = totalBranches - submittedBranches;

    res.status(200).json({
      totalBranches,
      totalSubmissions,
      thisWeek,
      pending,
      currentWeek
    });
  } catch (err) {
    console.error(" GET /admin/stats error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Updated Export records as CSV with user names from access codes
app.get("/admin/export", async (req, res) => {
  const { branchId, date, format = 'csv' } = req.query;

  try {
    let query = `
      SELECT 
        b.name AS "Branch Name",
        ir.branch_id AS "Branch ID",
        ir.week_ending AS "Week Ending",
        cg.name AS "Cylinder Group",
        ct.label AS "Cylinder Type",
        ir.full_count AS "Full Count",
        ir.empty_count AS "Empty Count",
        ir.created_at AS "Submitted At",
        COALESCE(ac.user_name, 'Unknown User') AS "Submitted By"
      FROM inventory_records ir
      JOIN cylinder_types ct ON ir.type_id = ct.id
      JOIN branches b ON ir.branch_id = b.id
      JOIN cylinder_groups cg ON ct.group_id = cg.id
      LEFT JOIN access_codes ac ON ir.submitted_by_code = ac.code
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 0;

    if (branchId) {
      paramCount++;
      query += ` AND ir.branch_id = $${paramCount}`;
      params.push(branchId);
    }

    if (date) {
      paramCount++;
      query += ` AND ir.week_ending = $${paramCount}`;
      params.push(date);
    }

    query += ` ORDER BY ir.week_ending DESC, b.name, cg.name, ct.label`;

    const result = await pool.query(query, params);

    if (format === 'csv') {
      const headers = Object.keys(result.rows[0] || {});
      const csvContent = [
        headers.join(','),
        ...result.rows.map(row => 
          headers.map(header => {
            const value = row[header];
            // Handle dates and escape commas/quotes
            if (value instanceof Date) {
              return value.toISOString().split('T')[0];
            }
            if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return value || '';
          }).join(',')
        )
      ].join('\n');

      const filename = `inventory_records_${date || 'all'}_${branchId || 'all_branches'}_${new Date().toISOString().split('T')[0]}.csv`;
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csvContent);
    } else {
      res.status(200).json(result.rows);
    }
  } catch (err) {
    console.error(" GET /admin/export error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE ALL inventory records (DANGEROUS - Admin only)
app.delete("/admin/records/delete-all", async (req, res) => {
  try {
    // First, get count of records to be deleted
    const countResult = await pool.query("SELECT COUNT(*) as count FROM inventory_records");
    const recordCount = parseInt(countResult.rows[0].count);

    if (recordCount === 0) {
      return res.status(200).json({ 
        message: "No records to delete", 
        deletedCount: 0 
      });
    }

    // Delete all inventory records
    const deleteResult = await pool.query("DELETE FROM inventory_records");
    
    console.log(`🗑️ ADMIN ACTION: Deleted ${recordCount} inventory records`);

    res.status(200).json({
      message: `Successfully deleted all inventory records`,
      deletedCount: recordCount
    });
  } catch (err) {
    console.error(" DELETE /admin/records/delete-all error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get cylinder types for a branch
app.get("/cylinder-types", async (req, res) => {
  const { branchId, group } = req.query;

  if (!branchId) {
    return res.status(400).json({ error: "Missing branchId" });
  }
  
  try {
    let query = `
      SELECT ct.id, ct.label, cg.name AS group
      FROM branch_cylinder_types bct
      JOIN cylinder_types ct ON bct.type_id = ct.id
      JOIN cylinder_groups cg ON ct.group_id = cg.id
      WHERE bct.branch_id = $1
    `;
    const params = [branchId];

    if (group) {
      query += " AND cg.name = $2";
      params.push(group);
    }

    query += " ORDER BY cg.name, ct.label";

    const result = await pool.query(query, params);
    res.status(200).json(result.rows);
  } catch (err) {
    console.error(" Error fetching cylinder types:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Updated Submit inventory records with access code for user tracking
app.post("/records", async (req, res) => {
  const { branchId, records, accessCode } = req.body;

  // Step 1: Basic validation
  if (!branchId || !Array.isArray(records)) {
    return res.status(400).json({ error: "branchId and records array are required" });
  }

  // Step 2: Validate each record
  for (let record of records) {
    const { typeId, weekEnding, fullCount, emptyCount } = record;

    if (!typeId || !weekEnding || fullCount == null || emptyCount == null) {
      return res.status(400).json({ error: "Missing required fields in one of the records" });
    }

    if (fullCount < 0 || emptyCount < 0) {
      return res.status(400).json({ error: "Counts must be 0 or greater" });
    }
  }

  // Step 3: Insert records into DB with access code
  try {
    const insertResults = [];

    for (let record of records) {
      const { typeId, weekEnding, fullCount, emptyCount } = record;

      try {
        const result = await pool.query(
          `INSERT INTO inventory_records (branch_id, type_id, week_ending, full_count, empty_count, created_at, submitted_by_code)
           VALUES ($1, $2, $3, $4, $5, NOW(), $6)
           RETURNING *`,
          [branchId, typeId, weekEnding, fullCount, emptyCount, accessCode]
        );
        insertResults.push(result.rows[0]);

      } catch (err) {
        if (err.code === '23505') { // duplicate key violation
          return res.status(409).json({ error: `Duplicate entry for typeId ${typeId} on ${weekEnding}` });
        } else {
          console.error("DB Insert error:", err);
          return res.status(500).json({ error: "Internal server error" });
        }
      }
    }

    console.log(`✅ Successfully inserted ${insertResults.length} records for branch ${branchId} by access code ${accessCode}`);

    return res.status(201).json({ 
      message: "Records saved successfully", 
      data: insertResults,
      count: insertResults.length
    });

  } catch (err) {
    console.error(" Unexpected error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Check for missing submissions for a given week
app.get("/records/missing", async (req, res) => {
  const { date } = req.query;
  
  if (!date) {
    return res.status(400).json({ error: "Date parameter is required" });
  }

  try {
    // Get all branches
    const allBranches = await pool.query("SELECT id, name FROM branches ORDER BY id");
    
    // Get branches that have submitted for this week
    const submittedBranches = await pool.query(
      "SELECT DISTINCT branch_id FROM inventory_records WHERE week_ending = $1",
      [date]
    );
    
    const submittedBranchIds = submittedBranches.rows.map(row => row.branch_id);
    
    // Find missing branches
    const missingBranches = allBranches.rows.filter(
      branch => !submittedBranchIds.includes(branch.id)
    );

    res.status(200).json(missingBranches);
  } catch (err) {
    console.error(" Error checking missing submissions:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ========== USER MANAGEMENT ENDPOINTS ==========

// Get all access codes/users for admin management
app.get("/admin/users", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        ac.id,
        ac.code,
        ac.user_name,
        ac.branch_id,
        ac.active,
        b.name as branch_name
      FROM access_codes ac
      LEFT JOIN branches b ON ac.branch_id = b.id
      ORDER BY ac.code
    `);

    res.status(200).json(result.rows);
  } catch (err) {
    console.error(" GET /admin/users error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create new user/access code
app.post("/admin/users", async (req, res) => {
  const { code, user_name, branch_id, active = true } = req.body;

  if (!code || !user_name || !branch_id) {
    return res.status(400).json({ error: "Code, user_name, and branch_id are required" });
  }

  try {
    // Check if code already exists
    const existingCode = await pool.query(
      "SELECT id FROM access_codes WHERE code = $1",
      [code]
    );

    if (existingCode.rows.length > 0) {
      return res.status(409).json({ error: "Access code already exists" });
    }

    // Check if branch exists
    const branchExists = await pool.query(
      "SELECT id FROM branches WHERE id = $1",
      [branch_id]
    );

    if (branchExists.rows.length === 0) {
      return res.status(400).json({ error: "Branch does not exist" });
    }

    // Insert new access code
    const result = await pool.query(
      `INSERT INTO access_codes (code, user_name, branch_id, active)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [code, user_name, branch_id, active]
    );

    console.log(`✅ Created new user: ${user_name} with code ${code}`);

    res.status(201).json({
      message: "User created successfully",
      user: result.rows[0]
    });
  } catch (err) {
    console.error(" POST /admin/users error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update existing user/access code
app.put("/admin/users/:id", async (req, res) => {
  const { id } = req.params;
  const { code, user_name, branch_id, active } = req.body;

  if (!code || !user_name || !branch_id) {
    return res.status(400).json({ error: "Code, user_name, and branch_id are required" });
  }

  try {
    // Check if user exists
    const userExists = await pool.query(
      "SELECT id FROM access_codes WHERE id = $1",
      [id]
    );

    if (userExists.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if code already exists for different user
    const existingCode = await pool.query(
      "SELECT id FROM access_codes WHERE code = $1 AND id != $2",
      [code, id]
    );

    if (existingCode.rows.length > 0) {
      return res.status(409).json({ error: "Access code already exists for another user" });
    }

    // Check if branch exists
    const branchExists = await pool.query(
      "SELECT id FROM branches WHERE id = $1",
      [branch_id]
    );

    if (branchExists.rows.length === 0) {
      return res.status(400).json({ error: "Branch does not exist" });
    }

    // Update access code
    const result = await pool.query(
      `UPDATE access_codes 
       SET code = $1, user_name = $2, branch_id = $3, active = $4
       WHERE id = $5
       RETURNING *`,
      [code, user_name, branch_id, active, id]
    );

    console.log(`✅ Updated user: ${user_name} with code ${code}`);

    res.status(200).json({
      message: "User updated successfully",
      user: result.rows[0]
    });
  } catch (err) {
    console.error(" PUT /admin/users error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete user/access code
app.delete("/admin/users/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // Check if user exists
    const userExists = await pool.query(
      "SELECT code, user_name FROM access_codes WHERE id = $1",
      [id]
    );

    if (userExists.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = userExists.rows[0];

    // Check if user has any inventory records
    const hasRecords = await pool.query(
      "SELECT COUNT(*) as count FROM inventory_records WHERE submitted_by_code = $1",
      [user.code]
    );

    if (parseInt(hasRecords.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: "Cannot delete user with existing inventory records. Deactivate instead." 
      });
    }

    // Delete access code
    await pool.query("DELETE FROM access_codes WHERE id = $1", [id]);

    console.log(`✅ Deleted user: ${user.user_name} with code ${user.code}`);

    res.status(200).json({
      message: "User deleted successfully"
    });
  } catch (err) {
    console.error(" DELETE /admin/users error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Bulk update user statuses (activate/deactivate multiple users)
app.patch("/admin/users/bulk-status", async (req, res) => {
  const { userIds, active } = req.body;

  if (!Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({ error: "userIds array is required" });
  }

  if (typeof active !== 'boolean') {
    return res.status(400).json({ error: "active must be a boolean" });
  }

  try {
    const placeholders = userIds.map((_, index) => `$${index + 1}`).join(',');
    const result = await pool.query(
      `UPDATE access_codes 
       SET active = $${userIds.length + 1}
       WHERE id IN (${placeholders})
       RETURNING code, user_name`,
      [...userIds, active]
    );

    console.log(`✅ Bulk updated ${result.rows.length} users to ${active ? 'active' : 'inactive'}`);

    res.status(200).json({
      message: `Successfully ${active ? 'activated' : 'deactivated'} ${result.rows.length} users`,
      updatedUsers: result.rows
    });
  } catch (err) {
    console.error(" PATCH /admin/users/bulk-status error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get user activity/statistics
app.get("/admin/users/:id/activity", async (req, res) => {
  const { id } = req.params;

  try {
    // Get user info
    const userResult = await pool.query(
      "SELECT code, user_name, branch_id FROM access_codes WHERE id = $1",
      [id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = userResult.rows[0];

    // Get submission statistics
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_submissions,
        COUNT(DISTINCT week_ending) as weeks_submitted,
        MIN(created_at) as first_submission,
        MAX(created_at) as last_submission,
        SUM(full_count + empty_count) as total_cylinders_counted
      FROM inventory_records 
      WHERE submitted_by_code = $1
    `, [user.code]);

    // Get recent submissions
    const recentResult = await pool.query(`
      SELECT 
        ir.week_ending,
        ir.created_at,
        ct.label as cylinder_type,
        ir.full_count,
        ir.empty_count,
        cg.name as group_name
      FROM inventory_records ir
      JOIN cylinder_types ct ON ir.type_id = ct.id
      JOIN cylinder_groups cg ON ct.group_id = cg.id
      WHERE ir.submitted_by_code = $1
      ORDER BY ir.created_at DESC
      LIMIT 10
    `, [user.code]);

    res.status(200).json({
      user: {
        ...user,
        id: parseInt(id)
      },
      statistics: statsResult.rows[0],
      recentSubmissions: recentResult.rows
    });
  } catch (err) {
    console.error(" GET /admin/users/:id/activity error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ========== CYLINDER MANAGEMENT ENDPOINTS ==========

// Get all cylinder groups
app.get("/admin/cylinder-groups", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, created_at
      FROM cylinder_groups 
      ORDER BY name
    `);

    res.status(200).json(result.rows);
  } catch (err) {
    console.error(" GET /admin/cylinder-groups error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create new cylinder group
app.post("/admin/cylinder-groups", async (req, res) => {
  const { name } = req.body;

  if (!name || name.trim() === '') {
    return res.status(400).json({ error: "Group name is required" });
  }

  try {
    // Check if group name already exists
    const existingGroup = await pool.query(
      "SELECT id FROM cylinder_groups WHERE LOWER(name) = LOWER($1)",
      [name.trim()]
    );

    if (existingGroup.rows.length > 0) {
      return res.status(409).json({ error: "Cylinder group with this name already exists" });
    }

    // Insert new group
    const result = await pool.query(
      `INSERT INTO cylinder_groups (name, created_at)
       VALUES ($1, NOW())
       RETURNING *`,
      [name.trim()]
    );

    console.log(`✅ Created new cylinder group: ${name}`);

    res.status(201).json({
      message: "Cylinder group created successfully",
      group: result.rows[0]
    });
  } catch (err) {
    console.error(" POST /admin/cylinder-groups error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update cylinder group
app.put("/admin/cylinder-groups/:id", async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;

  if (!name || name.trim() === '') {
    return res.status(400).json({ error: "Group name is required" });
  }

  try {
    // Check if group exists
    const groupExists = await pool.query(
      "SELECT id FROM cylinder_groups WHERE id = $1",
      [id]
    );

    if (groupExists.rows.length === 0) {
      return res.status(404).json({ error: "Cylinder group not found" });
    }

    // Check if name already exists for different group
    const existingGroup = await pool.query(
      "SELECT id FROM cylinder_groups WHERE LOWER(name) = LOWER($1) AND id != $2",
      [name.trim(), id]
    );

    if (existingGroup.rows.length > 0) {
      return res.status(409).json({ error: "Cylinder group with this name already exists" });
    }

    // Update group
    const result = await pool.query(
      `UPDATE cylinder_groups 
       SET name = $1
       WHERE id = $2
       RETURNING *`,
      [name.trim(), id]
    );

    console.log(`✅ Updated cylinder group: ${name}`);

    res.status(200).json({
      message: "Cylinder group updated successfully",
      group: result.rows[0]
    });
  } catch (err) {
    console.error(" PUT /admin/cylinder-groups error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete cylinder group
app.delete("/admin/cylinder-groups/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // Check if group exists
    const groupExists = await pool.query(
      "SELECT name FROM cylinder_groups WHERE id = $1",
      [id]
    );

    if (groupExists.rows.length === 0) {
      return res.status(404).json({ error: "Cylinder group not found" });
    }

    const groupName = groupExists.rows[0].name;

    // Check if group has any cylinder types
    const hasTypes = await pool.query(
      "SELECT COUNT(*) as count FROM cylinder_types WHERE group_id = $1",
      [id]
    );

    if (parseInt(hasTypes.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: "Cannot delete group that contains cylinder types. Delete the types first." 
      });
    }

    // Delete group
    await pool.query("DELETE FROM cylinder_groups WHERE id = $1", [id]);

    console.log(`✅ Deleted cylinder group: ${groupName}`);

    res.status(200).json({
      message: "Cylinder group deleted successfully"
    });
  } catch (err) {
    console.error(" DELETE /admin/cylinder-groups error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get all cylinder types with group information
app.get("/admin/cylinder-types", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        ct.id,
        ct.label,
        ct.group_id,
        cg.name as group_name,
        ct.created_at
      FROM cylinder_types ct
      JOIN cylinder_groups cg ON ct.group_id = cg.id
      ORDER BY cg.name, ct.label
    `);

    res.status(200).json(result.rows);
  } catch (err) {
    console.error(" GET /admin/cylinder-types error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create new cylinder type
app.post("/admin/cylinder-types", async (req, res) => {
  const { label, group_id } = req.body;

  if (!label || label.trim() === '' || !group_id) {
    return res.status(400).json({ error: "Label and group_id are required" });
  }

  try {
    // Check if group exists
    const groupExists = await pool.query(
      "SELECT id FROM cylinder_groups WHERE id = $1",
      [group_id]
    );

    if (groupExists.rows.length === 0) {
      return res.status(400).json({ error: "Cylinder group does not exist" });
    }

    // Check if type label already exists in the same group
    const existingType = await pool.query(
      "SELECT id FROM cylinder_types WHERE LOWER(label) = LOWER($1) AND group_id = $2",
      [label.trim(), group_id]
    );

    if (existingType.rows.length > 0) {
      return res.status(409).json({ error: "Cylinder type with this label already exists in this group" });
    }

    // Insert new type
    const result = await pool.query(
      `INSERT INTO cylinder_types (label, group_id, created_at)
       VALUES ($1, $2, NOW())
       RETURNING *`,
      [label.trim(), group_id]
    );

    console.log(`✅ Created new cylinder type: ${label} in group ${group_id}`);

    res.status(201).json({
      message: "Cylinder type created successfully",
      type: result.rows[0]
    });
  } catch (err) {
    console.error(" POST /admin/cylinder-types error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update cylinder type
app.put("/admin/cylinder-types/:id", async (req, res) => {
  const { id } = req.params;
  const { label, group_id } = req.body;

  if (!label || label.trim() === '' || !group_id) {
    return res.status(400).json({ error: "Label and group_id are required" });
  }

  try {
    // Check if type exists
    const typeExists = await pool.query(
      "SELECT id FROM cylinder_types WHERE id = $1",
      [id]
    );

    if (typeExists.rows.length === 0) {
      return res.status(404).json({ error: "Cylinder type not found" });
    }

    // Check if group exists
    const groupExists = await pool.query(
      "SELECT id FROM cylinder_groups WHERE id = $1",
      [group_id]
    );

    if (groupExists.rows.length === 0) {
      return res.status(400).json({ error: "Cylinder group does not exist" });
    }

    // Check if label already exists in the same group for different type
    const existingType = await pool.query(
      "SELECT id FROM cylinder_types WHERE LOWER(label) = LOWER($1) AND group_id = $2 AND id != $3",
      [label.trim(), group_id, id]
    );

    if (existingType.rows.length > 0) {
      return res.status(409).json({ error: "Cylinder type with this label already exists in this group" });
    }

    // Update type
    const result = await pool.query(
      `UPDATE cylinder_types 
       SET label = $1, group_id = $2
       WHERE id = $3
       RETURNING *`,
      [label.trim(), group_id, id]
    );

    console.log(`✅ Updated cylinder type: ${label}`);

    res.status(200).json({
      message: "Cylinder type updated successfully",
      type: result.rows[0]
    });
  } catch (err) {
    console.error(" PUT /admin/cylinder-types error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete cylinder type
app.delete("/admin/cylinder-types/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // Check if type exists
    const typeExists = await pool.query(
      "SELECT label FROM cylinder_types WHERE id = $1",
      [id]
    );

    if (typeExists.rows.length === 0) {
      return res.status(404).json({ error: "Cylinder type not found" });
    }

    const typeLabel = typeExists.rows[0].label;

    // Check if type is used in any inventory records
    const hasRecords = await pool.query(
      "SELECT COUNT(*) as count FROM inventory_records WHERE type_id = $1",
      [id]
    );

    if (parseInt(hasRecords.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: "Cannot delete cylinder type that has been used in inventory records" 
      });
    }

    // Check if type is assigned to any branches
    const hasBranchAssignments = await pool.query(
      "SELECT COUNT(*) as count FROM branch_cylinder_types WHERE type_id = $1",
      [id]
    );

    if (parseInt(hasBranchAssignments.rows[0].count) > 0) {
      // Remove branch assignments first
      await pool.query("DELETE FROM branch_cylinder_types WHERE type_id = $1", [id]);
    }

    // Delete type
    await pool.query("DELETE FROM cylinder_types WHERE id = $1", [id]);

    console.log(`✅ Deleted cylinder type: ${typeLabel}`);

    res.status(200).json({
      message: "Cylinder type deleted successfully"
    });
  } catch (err) {
    console.error(" DELETE /admin/cylinder-types error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get cylinder types for a specific branch
app.get("/admin/branch-cylinder-types/:branchId", async (req, res) => {
  const { branchId } = req.params;

  try {
    const result = await pool.query(`
      SELECT 
        bct.branch_id,
        bct.type_id,
        ct.label as type_label,
        ct.group_id,
        cg.name as group_name
      FROM branch_cylinder_types bct
      JOIN cylinder_types ct ON bct.type_id = ct.id
      JOIN cylinder_groups cg ON ct.group_id = cg.id
      WHERE bct.branch_id = $1
      ORDER BY cg.name, ct.label
    `, [branchId]);

    res.status(200).json(result.rows);
  } catch (err) {
    console.error(" GET /admin/branch-cylinder-types error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Add cylinder type to branch
app.post("/admin/branch-cylinder-types", async (req, res) => {
  const { branch_id, type_id } = req.body;

  if (!branch_id || !type_id) {
    return res.status(400).json({ error: "branch_id and type_id are required" });
  }

  try {
    // Check if branch exists
    const branchExists = await pool.query(
      "SELECT id FROM branches WHERE id = $1",
      [branch_id]
    );

    if (branchExists.rows.length === 0) {
      return res.status(400).json({ error: "Branch does not exist" });
    }

    // Check if cylinder type exists
    const typeExists = await pool.query(
      "SELECT id FROM cylinder_types WHERE id = $1",
      [type_id]
    );

    if (typeExists.rows.length === 0) {
      return res.status(400).json({ error: "Cylinder type does not exist" });
    }

    // Check if assignment already exists
    const existingAssignment = await pool.query(
      "SELECT id FROM branch_cylinder_types WHERE branch_id = $1 AND type_id = $2",
      [branch_id, type_id]
    );

    if (existingAssignment.rows.length > 0) {
      return res.status(409).json({ error: "Cylinder type is already assigned to this branch" });
    }

    // Insert new assignment
    const result = await pool.query(
      `INSERT INTO branch_cylinder_types (branch_id, type_id, created_at)
       VALUES ($1, $2, NOW())
       RETURNING *`,
      [branch_id, type_id]
    );

    console.log(`✅ Added cylinder type ${type_id} to branch ${branch_id}`);

    res.status(201).json({
      message: "Cylinder type assigned to branch successfully",
      assignment: result.rows[0]
    });
  } catch (err) {
    console.error(" POST /admin/branch-cylinder-types error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Remove cylinder type from branch
app.delete("/admin/branch-cylinder-types", async (req, res) => {
  const { branch_id, type_id } = req.body;

  if (!branch_id || !type_id) {
    return res.status(400).json({ error: "branch_id and type_id are required" });
  }

  try {
    // Check if assignment exists
    const assignmentExists = await pool.query(
      "SELECT id FROM branch_cylinder_types WHERE branch_id = $1 AND type_id = $2",
      [branch_id, type_id]
    );

    if (assignmentExists.rows.length === 0) {
      return res.status(404).json({ error: "Assignment not found" });
    }

    // Check if this type has been used in inventory records for this branch
    const hasRecords = await pool.query(
      "SELECT COUNT(*) as count FROM inventory_records WHERE branch_id = $1 AND type_id = $2",
      [branch_id, type_id]
    );

    if (parseInt(hasRecords.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: "Cannot remove cylinder type that has been used in inventory records for this branch" 
      });
    }

    // Delete assignment
    await pool.query(
      "DELETE FROM branch_cylinder_types WHERE branch_id = $1 AND type_id = $2",
      [branch_id, type_id]
    );

    console.log(`✅ Removed cylinder type ${type_id} from branch ${branch_id}`);

    res.status(200).json({
      message: "Cylinder type removed from branch successfully"
    });
  } catch (err) {
    console.error(" DELETE /admin/branch-cylinder-types error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Bulk assign cylinder types to branch
app.post("/admin/branch-cylinder-types/bulk", async (req, res) => {
  const { branch_id, type_ids } = req.body;

  if (!branch_id || !Array.isArray(type_ids) || type_ids.length === 0) {
    return res.status(400).json({ error: "branch_id and type_ids array are required" });
  }

  try {
    // Check if branch exists
    const branchExists = await pool.query(
      "SELECT id FROM branches WHERE id = $1",
      [branch_id]
    );

    if (branchExists.rows.length === 0) {
      return res.status(400).json({ error: "Branch does not exist" });
    }

    // Check if all cylinder types exist
    const placeholders = type_ids.map((_, index) => `${index + 1}`).join(',');
    const typesExist = await pool.query(
      `SELECT id FROM cylinder_types WHERE id IN (${placeholders})`,
      type_ids
    );

    if (typesExist.rows.length !== type_ids.length) {
      return res.status(400).json({ error: "One or more cylinder types do not exist" });
    }

    // Get existing assignments
    const existingAssignments = await pool.query(
      `SELECT type_id FROM branch_cylinder_types WHERE branch_id = $1 AND type_id IN (${placeholders})`,
      [branch_id, ...type_ids]
    );

    const existingTypeIds = existingAssignments.rows.map(row => row.type_id);
    const newTypeIds = type_ids.filter(typeId => !existingTypeIds.includes(typeId));

    if (newTypeIds.length === 0) {
      return res.status(409).json({ error: "All cylinder types are already assigned to this branch" });
    }

    // Insert new assignments
    const insertPromises = newTypeIds.map(typeId => 
      pool.query(
        `INSERT INTO branch_cylinder_types (branch_id, type_id, created_at)
         VALUES ($1, $2, NOW())`,
        [branch_id, typeId]
      )
    );

    await Promise.all(insertPromises);

    console.log(`✅ Bulk assigned ${newTypeIds.length} cylinder types to branch ${branch_id}`);

    res.status(201).json({
      message: `Successfully assigned ${newTypeIds.length} cylinder types to branch`,
      assignedCount: newTypeIds.length,
      skippedCount: existingTypeIds.length
    });
  } catch (err) {
    console.error(" POST /admin/branch-cylinder-types/bulk error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get cylinder assignment summary for all branches
app.get("/admin/cylinder-assignments-summary", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        b.id as branch_id,
        b.name as branch_name,
        COUNT(bct.type_id) as assigned_types_count,
        ARRAY_AGG(
          CASE 
            WHEN bct.type_id IS NOT NULL 
            THEN jsonb_build_object(
              'type_id', ct.id,
              'type_label', ct.label,
              'group_name', cg.name
            )
            ELSE NULL
          END
        ) FILTER (WHERE bct.type_id IS NOT NULL) as assigned_types
      FROM branches b
      LEFT JOIN branch_cylinder_types bct ON b.id = bct.branch_id
      LEFT JOIN cylinder_types ct ON bct.type_id = ct.id
      LEFT JOIN cylinder_groups cg ON ct.group_id = cg.id
      GROUP BY b.id, b.name
      ORDER BY b.name
    `);

    res.status(200).json(result.rows);
  } catch (err) {
    console.error(" GET /admin/cylinder-assignments-summary error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Helper function to get current week's Sunday
function getCurrentWeekSunday() {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - dayOfWeek);
  return sunday.toISOString().split('T')[0];
}

// Optional: Keep connection alive in dev (every 4 min)
setInterval(() => {
  pool.query("SELECT 1").catch(() => {});
}, 1000 * 60 * 4);

const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📊 Admin dashboard available at http://localhost:${PORT}/admin/stats`);
  console.log(`📋 Records API available at http://localhost:${PORT}/records`);
  console.log(`👥 User management API available at http://localhost:${PORT}/admin/users`);
  console.log(`🗑️ Delete all records API available at http://localhost:${PORT}/admin/records/delete-all`);
  console.log(`⚙️ Cylinder management API available at http://localhost:${PORT}/admin/cylinder-groups`);
  console.log(`🌐 CORS enabled for: cylinder-tracking-app.netlify.app`);
});

module.exports = app;
