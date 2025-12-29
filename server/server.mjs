import express from 'express';
import pg from 'pg';
import cors from 'cors';

const { Pool } = pg;

const app = express();

// 1. DYNAMIC PORT (Required for Render)
const port = process.env.PORT || 3001;

// 2. Database Connection (Dynamic)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL, 
    ssl: {
        rejectUnauthorized: false // Required for Neon/Cloud DBs
    }
});

// 3. CORS Configuration (Security)
// We allow '*' (all origins) to fix your connection issues immediately.
app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'OPTIONS'], // Added OPTIONS for preflight checks
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Enable JSON parsing for incoming requests
app.use(express.json());

// --- TEST ENDPOINT ---
app.get('/api/test', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.status(200).send({ message: 'Neon DB connection successful!', time: result.rows[0].now });
    } catch (error) {
        console.error('Database connection error:', error.message);
        res.status(500).send({ message: 'Database connection failed.', error: error.message });
    }
});

// --- HELPER: FIND OR CREATE METAL ---
async function findOrCreateMetal(client, metalData) {
    const findQuery = `SELECT id FROM "HeavyMetal" WHERE symbol = $1 AND valence_state = $2`;
    let result = await client.query(findQuery, [metalData.symbol, metalData.valence_state]);
    
    if (result.rows.length > 0) return result.rows[0].id;

    const insertQuery = `
        INSERT INTO "HeavyMetal" (metal_name, symbol, valence_state, ligand_type, atomic_number)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id;
    `;
    result = await client.query(insertQuery, [
        metalData.metal_name, metalData.symbol, metalData.valence_state, 
        metalData.ligand_type || null, metalData.atomic_number || null
    ]);
    return result.rows[0].id;
}

// --- MAIN DATA ENDPOINT ---
app.post('/api/core-data', async (req, res) => {
    const client = await pool.connect();
    
    // Extract data from the frontend request
    const { sampleData, microbeData, expData, capacityData, metalData } = req.body;
    
    try {
        await client.query('BEGIN');
        
        const heavyMetalId = await findOrCreateMetal(client, metalData);

        const sampleQuery = `INSERT INTO "Environmental_Sample" (sample_name, isolation_date, latitude, longitude, habitat_type) VALUES ($1, $2, $3, $4, $5) RETURNING id;`;
        const sampleResult = await client.query(sampleQuery, [sampleData.sample_name, new Date().toISOString().split('T')[0], sampleData.latitude, sampleData.longitude, sampleData.habitat_type]);
        const sampleId = sampleResult.rows[0].id;

        const microbeQuery = `INSERT INTO "Microorganism" (sample_id, strain_name, genus, species, ncbi_taxonomy_id, collection_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id;`;
        const microbeResult = await client.query(microbeQuery, [sampleId, microbeData.strain_name, microbeData.genus, microbeData.species || null, microbeData.ncbi_taxonomy_id || null, microbeData.collection_id || null]);
        const microorganismId = microbeResult.rows[0].id;

        const expQuery = `INSERT INTO "Experiment_Setup" (microorganism_id, optimal_ph, optimal_temp, initial_conc_mg_L, nutrient_regime, publication_doi) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id;`;
        const expResult = await client.query(expQuery, [microorganismId, expData.optimal_ph, expData.optimal_temp, expData.initial_conc_mg_L, expData.nutrient_regime, expData.publication_doi]);
        const experimentSetupId = expResult.rows[0].id;
        
        const capacityQuery = `INSERT INTO "RemediationCapacity" (experiment_setup_id, heavy_metal_id, time_h, removal_efficiency, max_uptake_mg_g, mechanism) VALUES ($1, $2, $3, $4, $5, $6);`;
        await client.query(capacityQuery, [experimentSetupId, heavyMetalId, capacityData.time_h, capacityData.removal_efficiency, capacityData.max_uptake_mg_g, capacityData.mechanism]);

        await client.query('COMMIT');
        res.status(201).send({ message: 'Success! Record created.', microorganism_id: microorganismId });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Transaction Failed:', error);
        res.status(500).send({ message: 'Server Error', error: error.message });
    } finally {
        client.release();
    }
});

app.listen(port, () => {
    console.log(`API Server running on port ${port}`);
});