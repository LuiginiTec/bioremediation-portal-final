import express from 'express';
import pg from 'pg';
import cors from 'cors';

const { Pool } = pg;

const app = express();
const port = process.env.PORT || 3001;

// Database Connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL, 
    ssl: { rejectUnauthorized: false }
});

// Security & Configuration
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type'] }));
app.use(express.json());

// --- 1. GET ENDPOINT (Fixes the "0 Count" issue) ---
app.get('/api/microorganisms', async (req, res) => {
    try {
        // We join with Sample to get the Habitat Type for context
        const query = `
            SELECT m.id, m.strain_name, m.genus, es.habitat_type 
            FROM "Microorganism" m
            JOIN "Environmental_Sample" es ON m.sample_id = es.id
            ORDER BY m.id DESC;
        `;
        const result = await pool.query(query);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching list:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- 2. POST ENDPOINT: CORE DATA (Already existed) ---
app.post('/api/core-data', async (req, res) => {
    const client = await pool.connect();
    const { sampleData, microbeData, expData, capacityData, metalData } = req.body;
    
    try {
        await client.query('BEGIN');

        // Helper: Find or Create Metal
        const metalFind = await client.query('SELECT id FROM "HeavyMetal" WHERE symbol = $1 AND valence_state = $2', [metalData.symbol, metalData.valence_state]);
        let heavyMetalId = metalFind.rows.length > 0 ? metalFind.rows[0].id : null;
        
        if (!heavyMetalId) {
            const metalInsert = await client.query(
                `INSERT INTO "HeavyMetal" (metal_name, symbol, valence_state, ligand_type, atomic_number) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                [metalData.metal_name, metalData.symbol, metalData.valence_state, metalData.ligand_type || null, metalData.atomic_number]
            );
            heavyMetalId = metalInsert.rows[0].id;
        }

        const sampleRes = await client.query(
            `INSERT INTO "Environmental_Sample" (sample_name, isolation_date, latitude, longitude, habitat_type) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [sampleData.sample_name, new Date().toISOString().split('T')[0], sampleData.latitude, sampleData.longitude, sampleData.habitat_type]
        );
        const sampleId = sampleRes.rows[0].id;

        const microbeRes = await client.query(
            `INSERT INTO "Microorganism" (sample_id, strain_name, genus, species, ncbi_taxonomy_id, collection_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [sampleId, microbeData.strain_name, microbeData.genus, microbeData.species, microbeData.ncbi_taxonomy_id, null]
        );
        const microorganismId = microbeRes.rows[0].id;

        const expRes = await client.query(
            `INSERT INTO "Experiment_Setup" (microorganism_id, optimal_ph, optimal_temp, initial_conc_mg_L, nutrient_regime, publication_doi) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [microorganismId, expData.optimal_ph, expData.optimal_temp, expData.initial_conc_mg_L, expData.nutrient_regime, expData.publication_doi]
        );
        const expId = expRes.rows[0].id;

        await client.query(
            `INSERT INTO "RemediationCapacity" (experiment_setup_id, heavy_metal_id, time_h, removal_efficiency, max_uptake_mg_g, mechanism) VALUES ($1, $2, $3, $4, $5, $6)`,
            [expId, heavyMetalId, capacityData.time_h, capacityData.removal_efficiency, capacityData.max_uptake_mg_g, capacityData.mechanism]
        );

        await client.query('COMMIT');
        res.status(201).send({ message: 'Core Record Created', microorganism_id: microorganismId });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Core Transaction Failed:', error);
        res.status(500).send({ message: 'Server Error', error: error.message });
    } finally {
        client.release();
    }
});

// --- 3. POST ENDPOINT: GENOMIC DATA ---
app.post('/api/genome-data', async (req, res) => {
    const { microorganism_id, genomeData } = req.body;
    try {
        const query = `
            INSERT INTO "Genome" (microorganism_id, accession_id, sequencing_platform, assembly_status, gc_content)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id;
        `;
        await pool.query(query, [
            microorganism_id, 
            genomeData.accession_id, 
            genomeData.sequencing_platform, 
            genomeData.assembly_status, 
            parseFloat(genomeData.gc_content) || null
        ]);
        res.status(201).json({ message: 'Genomic data saved successfully.' });
    } catch (error) {
        console.error('Genome Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- 4. POST ENDPOINT: METABOLISM DATA ---
app.post('/api/metabolism-data', async (req, res) => {
    const { microorganism_id, pathwayData } = req.body;
    try {
        const query = `
            INSERT INTO "Metabolism" (microorganism_id, kegg_pathway_id, pathway_name, metabolic_type, notes)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id;
        `;
        await pool.query(query, [
            microorganism_id, 
            pathwayData.kegg_pathway_id, 
            pathwayData.pathway_name, 
            pathwayData.metabolic_type, 
            pathwayData.notes
        ]);
        res.status(201).json({ message: 'Metabolism data saved successfully.' });
    } catch (error) {
        console.error('Metabolism Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`API Server running on port ${port}`);
});