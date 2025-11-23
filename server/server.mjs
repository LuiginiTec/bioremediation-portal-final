import express from 'express';
import pg from 'pg'; 
import cors from 'cors'; 

const { Pool } = pg; 

const app = express();
const port = 3001; 

// 1. Database Connection Configuration 
const pool = new Pool({
    // USE THE CREDENTIALS THAT FINALLY WORKED FOR YOU
    user: 'postgres', 
    host: 'localhost',
    database: 'Bioremediation_Database', 
    password: 'postgres', // <--- REPLACE WITH YOUR ACTUAL PASSWORD
    port: 5432, 
});

// 2. Middleware
app.use(cors()); 
app.use(express.json()); 

// 3. Test Endpoint
app.get('/api/test', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()'); 
        res.status(200).send({ message: 'PostgreSQL connection successful!', time: result.rows[0].now });
    } catch (error) {
        console.error('Database connection error:', error.message);
        res.status(500).send({ message: 'Database connection failed.', error: error.message });
    }
});

// --- HELPER FUNCTION: FIND OR CREATE HEAVY METAL ---
async function findOrCreateMetal(client, metalData) {
    // Check if the metal exists based on symbol and valence_state
    const findQuery = `
        SELECT id FROM "HeavyMetal" 
        WHERE symbol = $1 AND valence_state = $2
    `;
    let result = await client.query(findQuery, [metalData.symbol, metalData.valence_state]);
    
    if (result.rows.length > 0) {
        // Metal found, return existing ID
        return result.rows[0].id;
    }

    // Metal not found, insert new record
    const insertQuery = `
        INSERT INTO "HeavyMetal" (metal_name, symbol, valence_state, ligand_type, atomic_number)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id;
    `;
    result = await client.query(insertQuery, [
        metalData.metal_name, 
        metalData.symbol, 
        metalData.valence_state, 
        metalData.ligand_type || null, 
        metalData.atomic_number || null
    ]);

    // Return the new ID
    return result.rows[0].id;
}


// 4. CORE DATA INSERTION ENDPOINT
// Handles the 4-part normalized insertion: Sample -> Microbe -> Experiment -> Capacity
app.post('/api/core-data', async (req, res) => {
    const client = await pool.connect();
    
    // Data received from the React form
    const { sampleData, microbeData, expData, capacityData, metalData } = req.body;
    
    try {
        await client.query('BEGIN');
        
        // --- 0. FIND OR CREATE HEAVY METAL ---
        // This must be done inside the transaction to ensure the ID exists for the Capacity table.
        const heavyMetalId = await findOrCreateMetal(client, metalData);


        // A. INSERT Environmental_Sample
        const sampleQuery = `
            INSERT INTO "Environmental_Sample" (sample_name, isolation_date, latitude, longitude, habitat_type)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id;
        `;
        const sampleResult = await client.query(sampleQuery, [
            sampleData.sample_name, new Date().toISOString().split('T')[0], 
            sampleData.latitude, sampleData.longitude, sampleData.habitat_type
        ]);
        const sampleId = sampleResult.rows[0].id;

        // B. INSERT Microorganism
        const microbeQuery = `
            INSERT INTO "Microorganism" (sample_id, strain_name, genus, species, ncbi_taxonomy_id, collection_id)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id;
        `;
        const microbeResult = await client.query(microbeQuery, [
            sampleId, microbeData.strain_name, microbeData.genus, 
            microbeData.species || null, microbeData.ncbi_taxonomy_id || null, microbeData.collection_id || null
        ]);
        const microorganismId = microbeResult.rows[0].id;

        // C. INSERT Experiment_Setup
        const expQuery = `
            INSERT INTO "Experiment_Setup" (microorganism_id, optimal_ph, optimal_temp, initial_conc_mg_L, nutrient_regime, publication_doi)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id;
        `;
        const expResult = await client.query(expQuery, [
            microorganismId, expData.optimal_ph, expData.optimal_temp, 
            expData.initial_conc_mg_L, expData.nutrient_regime, expData.publication_doi
        ]);
        const experimentSetupId = expResult.rows[0].id;
        
        // D. INSERT RemediationCapacity (Uses the dynamically obtained heavyMetalId)
        const capacityQuery = `
            INSERT INTO "RemediationCapacity" (experiment_setup_id, heavy_metal_id, time_h, removal_efficiency, max_uptake_mg_g, mechanism)
            VALUES ($1, $2, $3, $4, $5, $6);
        `;
        await client.query(capacityQuery, [
            experimentSetupId, heavyMetalId, capacityData.time_h, 
            capacityData.removal_efficiency, capacityData.max_uptake_mg_g, capacityData.mechanism
        ]);

        await client.query('COMMIT');
        res.status(201).send({ message: 'Success! 4 linked records created.', microorganism_id: microorganismId });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Transaction Failed:', error);
        res.status(500).send({ message: 'Data insertion failed due to database error.', error: error.message });
    } finally {
        client.release();
    }
});


// 5. Start Server
app.listen(port, () => {
    console.log(`API Server running at http://localhost:${port}`);
});