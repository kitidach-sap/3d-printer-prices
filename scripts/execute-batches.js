const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Use service key if available, otherwise use anon key
const API_KEY = SUPABASE_SERVICE_KEY !== 'your-service-role-key-here'
    ? SUPABASE_SERVICE_KEY
    : SUPABASE_ANON_KEY;

async function executeBatch(sql, batchNum) {
    // Use the Supabase REST API for raw SQL execution
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': API_KEY,
            'Authorization': `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ query: sql }),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Batch ${batchNum} failed: ${response.status} - ${text}`);
    }

    return true;
}

async function main() {
    const batchDir = path.join(__dirname, '..', 'data', 'sql-batches');
    const files = fs.readdirSync(batchDir)
        .filter(f => f.endsWith('.sql'))
        .sort();

    console.log(`Found ${files.length} SQL batch files`);
    console.log(`Using Supabase URL: ${SUPABASE_URL}`);

    // Instead of REST API (which doesn't support raw SQL easily with anon key),
    // let's use the supabase-js client to insert directly from JSON
    const { createClient } = require('@supabase/supabase-js');

    // We'll read the JSON data and insert directly
    const dataPath = path.join(__dirname, '..', 'data', 'products.json');
    const products = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

    console.log(`Total products: ${products.length}`);

    // Use supabase client with anon key, but we need to temporarily disable RLS
    // Actually, let's just output the SQL as one big file for execution via psql or MCP

    const allSql = files.map(f => fs.readFileSync(path.join(batchDir, f), 'utf-8')).join('\n\n');
    const outputPath = path.join(__dirname, '..', 'data', 'all-products.sql');
    fs.writeFileSync(outputPath, allSql, 'utf-8');
    console.log(`Combined SQL written to: ${outputPath} (${(allSql.length / 1024).toFixed(1)} KB)`);
}

main().catch(console.error);
