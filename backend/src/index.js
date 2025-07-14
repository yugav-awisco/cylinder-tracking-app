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

// Add these headers to every response
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin);
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,PATCH,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  
  // Log the request for debugging
  console.log(`${req.method} ${req.path} from ${req.headers.origin || 'unknown origin'}`);
  
  next();
});

// Debug Info and Database URL Fix
console.log('🔍 Debug Info:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);
console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);
console.log('DATABASE_URL starts with:', process.env.DATABASE_URL?.substring(0, 15) + '...');

// Fix the DATABASE_URL format if needed
let databaseUrl = process.env.DATABASE_URL;
if (databaseUrl && databaseUrl.startsWith('postgres://')) {
  console.log('⚠️ Converting postgres:// to postgresql://');
  databaseUrl = databaseUrl.replace('postgres://', 'postgresql://');
}

// Improved connection pool configuration
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { 
    rejectUnauthorized: false,
    sslmode: 'require' 
  },
  
  // Render-specific optimizations
  max: 20,
  min: 1, // Start with at least 1 connection
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // Longer timeout for Render
  acquireTimeoutMillis: 60000,
  
  // Important for Render free tier
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

// Pool event handlers for debugging
pool.on('connect', (client) => {
  console.log('🔗 New client connected to database');
});

pool.on('acquire', (client) => {
  console.log('📥 Client acquired from pool');
});

pool.on('release', (client) => {
  console.log('📤 Client released back to pool');
});

pool.on('error', (err, client) => {
  console.error('❌ Pool error:', err);
});

// Test connection immediately on startup
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Failed to connect to database on startup:', err.message);
    console.error('Full error:', err);
  } else {
    console.log('✅ Successfully connected to database on startup');
    client.query('SELECT NOW()', (err, result) => {
      release();
      if (err) {
        console.error('❌ Database query test failed:', err.message);
      } else {
        console.log('✅ Database query test successful:', result.rows[0].now);
      }
    });
  }
});

// Basic health check
app.get("/", (req, res) => {
  res.json({
    status: "API is running",
    timestamp: new Date().toISOString(),
    version: "2.0.0"
  });
});

// Pool health monitoring endpoint
app.get("/health/pool", async (req, res) => {
  try {
    const start = Date.now();
    
    // Test basic connection
    const client = await pool.connect();
    const result = await client.query('SELECT NOW(), version()');
    client.release();
    
    const responseTime = Date.now() - start;
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: {
        connected: true,
        responseTime: `${responseTime}ms`,
        serverTime: result.rows[0].now,
        version: result.rows[0].version.split(' ')[0] + ' ' + result.rows[0].version.split(' ')[1]
      },
      pool: {
        totalCount: pool.totalCount || 0,
        idleCount: pool.idleCount || 0,
        waitingCount: pool.waitingCount || 0
      }
    });
  } catch (error) {
    console.error("❌ Pool health check failed:", error);
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message,
      database: {
        connected: false
      },
      pool: {
        totalCount: pool.totalCount || 0,
        idleCount: pool.idleCount || 0,
        waitingCount: pool.waitingCount || 0
      }
    });
  }
});

// Test submission endpoint (for debugging)
app.post("/records/test", async (req, res) => {
  const { branchId, records, accessCode } = req.body;
  
  console.log("🧪 Testing submission payload:", { branchId, recordCount: records?.length, accessCode: accessCode ? 'PROVIDED' : 'MISSING' });
  
  try {
    // Validate payload structure
    if (!branchId || !Array.isArray(records) || !accessCode) {
      return res.status(400).json({ 
        success: false,
        error: "Invalid payload structure",
        received: { 
          branchId: !!branchId, 
          records: Array.isArray(records) ? records.length : 'invalid',
          accessCode: !!accessCode 
        }
      });
    }

    // Test database connection
    const client = await pool.connect();
    
    // Test access code validity
    const accessResult = await client.query(
      "SELECT user_name FROM access_codes WHERE code = $1 AND active = TRUE",
      [accessCode]
    );
    
    client.release();
    
    if (accessResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: "Invalid or inactive access code"
      });
    }

    res.json({
      success: true,
      message: "Payload validation successful - ready for actual submission",
      validatedData: {
        branchId: parseInt(branchId),
        recordCount: records.length,
        userName: accessResult.rows[0].user_name,
        sampleRecord: records[0]
      }
    });

  } catch (error) {
    console.error("❌ Test submission failed:", error);
    res.status(500).json({
      success: false,
      error: "Database connection test failed",
      details: error.message
    });
  }
});

// Debug simple insert endpoint
app.post("/debug/simple-insert", async (req, res) => {
  console.log('🧪 Testing simple database insert...');
  
  try {
    // Test 1: Basic connection
    const client = await pool.connect();
    console.log('✅ Got database client');
    
    // Test 2: Simple query
    const timeResult = await client.query('SELECT NOW()');
    console.log('✅ Basic query successful:', timeResult.rows[0].now);
    
    // Test 3: Check if tables exist
    const tableCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('inventory_records', 'access_codes', 'branches')
    `);
    console.log('✅ Found tables:', tableCheck.rows.map(r => r.table_name));
    
    // Test 4: Check access_codes table
    const accessCodeCount = await client.query('SELECT COUNT(*) FROM access_codes');
    console.log('✅ Access codes count:', accessCodeCount.rows[0].count);
    
    // Test 5: Try to insert a test record (then delete it)
    await client.query('BEGIN');
    
    const testInsert = await client.query(`
      INSERT INTO inventory_records (branch_id, type_id, week_ending, full_count, empty_count, created_at, submitted_by_code)
      VALUES (1, 1, '2025-07-06', 1, 1, NOW(), 'TEST')
      RETURNING id
    `);
    console.log('✅ Test insert successful, ID:', testInsert.rows[0].id);
    
    // Clean up test record
    await client.query('DELETE FROM inventory_records WHERE submitted_by_code = $1', ['TEST']);
    await client.query('COMMIT');
    console.log('✅ Test record cleaned up');
    
    client.release();
    
    res.json({
      success: true,
      message: 'All database tests passed!',
      tests: {
        connection: 'SUCCESS',
        basicQuery: 'SUCCESS',
        tablesFound: tableCheck.rows.length,
        accessCodesCount: accessCodeCount.rows[0].count,
        insertTest: 'SUCCESS'
      }
    });
    
  } catch (error) {
    console.error('❌ Database test failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: error.code,
      detail: error.detail,
      hint: error.hint
    });
  }
});

// Updated Auth Route - now returns user name from database
app.post("/auth", async (req, res) => {
  console.log("🔐 Incoming /auth request:", req.body); // Debug

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
    console.error("❌ Auth error:", err);
    res.status(500).json({ message: "Server error during authentication." });
  }
});

// Get all branches
app.get("/branches", async (req, res) => {
  try {
    const result = await pool.query("SELECT id, name FROM branches ORDER BY name");
    res.status(200).json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching branches:", err);
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
    console.error("❌ GET /records error:", err);
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
    console.error("❌ GET /admin/records error:", err);
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
    console.error("❌ GET /admin/stats error:", err);
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
    console.error("❌ GET /admin/export error:", err);
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
    console.error("❌ DELETE /admin/records/delete-all error:", err);
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
    console.error("❌ Error fetching cylinder types:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// FIXED: Submit inventory records with proper transaction management
app.post("/records", async (req, res) => {
  const { branchId, records, accessCode } = req.body;

  // Enhanced logging for debugging
  console.log(`📝 Processing submission: Branch ${branchId}, ${records?.length || 0} records, Access Code: ${accessCode ? 'PROVIDED' : 'MISSING'}`);

  // Step 1: Enhanced validation
  if (!branchId || !Array.isArray(records)) {
    console.log("❌ Validation failed: Missing branchId or records array");
    return res.status(400).json({ error: "branchId and records array are required" });
  }

  if (!accessCode) {
    console.log("❌ Validation failed: Missing access code");
    return res.status(400).json({ error: "Access code is required" });
  }

  if (records.length === 0) {
    console.log("❌ Validation failed: Empty records array");
    return res.status(400).json({ error: "At least one record is required" });
  }

  // Step 2: Validate each record
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const { typeId, weekEnding, fullCount, emptyCount } = record;

    if (!typeId || !weekEnding || fullCount == null || emptyCount == null) {
      console.log(`❌ Record ${i} validation failed:`, record);
      return res.status(400).json({ 
        error: `Missing required fields in record ${i + 1}`,
        invalidRecord: record
      });
    }

    if (fullCount < 0 || emptyCount < 0) {
      console.log(`❌ Record ${i} has negative counts:`, record);
      return res.status(400).json({ 
        error: `Counts must be 0 or greater in record ${i + 1}`,
        invalidRecord: record
      });
    }
  }

  // Step 3: Use proper transaction with dedicated client
  const client = await pool.connect();
  
  try {
    console.log("🔄 Starting database transaction...");
    await client.query('BEGIN');

    // Step 3a: Verify access code first
    const accessCodeResult = await client.query(
      "SELECT branch_id, user_name, active FROM access_codes WHERE code = $1",
      [accessCode]
    );

    if (accessCodeResult.rows.length === 0) {
      console.log("❌ Invalid access code:", accessCode);
      await client.query('ROLLBACK');
      return res.status(401).json({ error: "Invalid access code" });
    }

    if (!accessCodeResult.rows[0].active) {
      console.log("❌ Inactive access code:", accessCode);
      await client.query('ROLLBACK');
      return res.status(401).json({ error: "Access code is inactive" });
    }

    const userName = accessCodeResult.rows[0].user_name;
    console.log(`✅ Access code validated for user: ${userName}`);

    // Step 3b: Check for duplicates before inserting
    const duplicateChecks = records.map(record => 
      `(branch_id = ${branchId} AND type_id = ${record.typeId} AND week_ending = '${record.weekEnding}')`
    ).join(' OR ');

    const duplicateResult = await client.query(
      `SELECT branch_id, type_id, week_ending FROM inventory_records WHERE ${duplicateChecks}`
    );

    if (duplicateResult.rows.length > 0) {
      console.log("❌ Duplicate records found:", duplicateResult.rows);
      await client.query('ROLLBACK');
      return res.status(409).json({ 
        error: "Duplicate entries detected. These records have already been submitted.",
        duplicates: duplicateResult.rows
      });
    }

    // Step 3c: Insert all records in single transaction
    const insertResults = [];
    console.log(`📝 Inserting ${records.length} records...`);

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const { typeId, weekEnding, fullCount, emptyCount } = record;

      const result = await client.query(
        `INSERT INTO inventory_records (branch_id, type_id, week_ending, full_count, empty_count, created_at, submitted_by_code)
         VALUES ($1, $2, $3, $4, $5, NOW(), $6)
         RETURNING id, branch_id, type_id, week_ending, full_count, empty_count, created_at`,
        [branchId, typeId, weekEnding, fullCount, emptyCount, accessCode]
      );
      
      insertResults.push(result.rows[0]);
      console.log(`✅ Inserted record ${i + 1}/${records.length}: typeId ${typeId}`);
    }

    // Step 3d: Commit transaction
    await client.query('COMMIT');
    console.log(`🎉 Successfully committed ${insertResults.length} records for branch ${branchId} by ${userName}`);

    return res.status(201).json({ 
      message: "Records saved successfully", 
      data: insertResults,
      count: insertResults.length,
      submittedBy: userName,
      branchId: parseInt(branchId)
    });

  } catch (err) {
    // Step 4: Rollback on any error
    console.error("❌ Transaction error:", err);
    
    try {
      await client.query('ROLLBACK');
      console.log("🔄 Transaction rolled back successfully");
    } catch (rollbackErr) {
      console.error("❌ Rollback failed:", rollbackErr);
    }

    // Handle specific error types
    if (err.code === '23505') { // Unique constraint violation
      return res.status(409).json({ 
        error: "Duplicate entry detected during insertion",
        details: err.detail
      });
    } else if (err.code === '23503') { // Foreign key violation
      return res.status(400).json({ 
        error: "Invalid branch ID or cylinder type ID",
        details: err.detail
      });
    } else if (err.code === '23514') { // Check constraint violation
      return res.status(400).json({ 
        error: "Data validation failed",
        details: err.detail
      });
    } else if (err.code === 'ECONNRESET' || err.code === 'ENOTFOUND') {
      return res.status(503).json({ 
        error: "Database connection issue. Please try again in a moment." 
      });
    } else if (err.message && err.message.includes('timeout')) {
      return res.status(408).json({ 
        error: "Database operation timed out. Please try again." 
      });
    } else {
      return res.status(500).json({ 
        error: "Server error during submission",
        message: process.env.NODE_ENV === 'development' ? err.message : "Internal server error"
      });
    }

  } finally {
    // Step 5: Always release the client back to pool
    client.release();
    console.log("📤 Database client released back to pool");
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
    console.error("❌ Error checking missing submissions:", err);
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
    console.error("❌ GET /admin/users error:", err);
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
    console.error("❌ POST /admin/users error:", err);
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
    console.error("❌ PUT /admin/users error:", err);
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
    console.error("❌ DELETE /admin/users error:", err);
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
    const placeholders = userIds.map((_, index) => `${index + 1}`).join(',');
    const result = await pool.query(
      `UPDATE access_codes 
       SET active = ${userIds.length + 1}
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
    console.error("❌ PATCH /admin/users/bulk-status error:", err);
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
    console.error("❌ GET /admin/users/:id/activity error:", err);
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

// Graceful shutdown handlers
process.on('SIGINT', async () => {
  console.log('🛑 Received SIGINT, closing pool...');
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 Received SIGTERM, closing pool...');
  await pool.end();
  process.exit(0);
});

// Keep connection alive in production (ping every 14 minutes to prevent sleeping)
if (process.env.NODE_ENV === 'production') {
  setInterval(() => {
    fetch(`${process.env.RENDER_EXTERNAL_URL || 'https://awisco-cylinder-api.onrender.com'}/health/pool`)
      .then(() => console.log('🏓 Keep-alive ping sent'))
      .catch(() => console.log('❌ Keep-alive ping failed'));
  }, 14 * 60 * 1000); // 14 minutes
} else {
  // Development: simpler keep-alive
  setInterval(() => {
    pool.query("SELECT 1").catch(() => {});
  }, 1000 * 60 * 4);
}

const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📊 Health check available at http://localhost:${PORT}/health/pool`);
  console.log(`📊 Admin dashboard available at http://localhost:${PORT}/admin/stats`);
  console.log(`📋 Records API available at http://localhost:${PORT}/records`);
  console.log(`🧪 Test submission API available at http://localhost:${PORT}/records/test`);
  console.log(`👥 User management API available at http://localhost:${PORT}/admin/users`);
  console.log(`🗑️ Delete all records API available at http://localhost:${PORT}/admin/records/delete-all`);
  console.log(`🔧 Debug simple insert API available at http://localhost:${PORT}/debug/simple-insert`);
  
  // Log pool configuration
  console.log(`🔗 Database pool configured: max=${pool.options?.max || 'default'}, min=${pool.options?.min || 'default'}`);
  console.log(`🌐 CORS enabled for: cylinder-tracking-app.netlify.app`);
});

module.exports = app;
