const fs = require('fs');
const path = require('path');
const https = require('https');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

async function executeSql(sql) {
    const url = `${SUPABASE_URL}/rest/v1/rpc/`;
    // The Supabase REST API doesn't support raw SQL. 
    // We need to use the PostgREST bulk insert instead.
    // Let's parse the products JSON and insert via PostgREST
    return null;
}

async function main() {
    const { createClient } = require('@supabase/supabase-js');

    // First, let's add a temporary policy to allow anon inserts
    // Actually, we can use PostgREST with the anon key since we have SELECT policy
    // We need to add an INSERT policy for anon

    const dataPath = path.join(__dirname, '..', 'data', 'products.json');
    const products = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

    console.log(`Total products to insert: ${products.length}`);

    // Use PostgREST bulk insert directly via fetch
    const BATCH_SIZE = 200;
    let inserted = 0;
    let errors = 0;

    for (let i = 0; i < products.length; i += BATCH_SIZE) {
        const batch = products.slice(i, i + BATCH_SIZE).map(p => ({
            asin: p.asin,
            product_name: p.product_name,
            product_type: p.product_type,
            category: p.category,
            condition: p.condition,
            capacity_gb: p.capacity_gb,
            capacity_text: p.capacity_text,
            price: p.price,
            price_per_gb: p.price_per_gb,
            price_per_tb: p.price_per_tb,
            warranty: p.warranty,
            form_factor: p.form_factor,
            technology: p.technology,
            amazon_url: p.amazon_url,
            locale: p.locale || 'us',
        }));

        const batchNum = Math.floor(i / BATCH_SIZE) + 1;

        const response = await fetch(`${SUPABASE_URL}/rest/v1/disk_products`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Prefer': 'return=minimal',
            },
            body: JSON.stringify(batch),
        });

        if (!response.ok) {
            const text = await response.text();
            console.error(`Batch ${batchNum} FAILED (${response.status}): ${text.substring(0, 200)}`);
            errors += batch.length;
        } else {
            inserted += batch.length;
            console.log(`  Batch ${batchNum}: ${batch.length} products inserted (${inserted}/${products.length})`);
        }
    }

    console.log(`\n=== Import Complete ===`);
    console.log(`Inserted: ${inserted}`);
    console.log(`Errors: ${errors}`);
}

main().catch(console.error);
