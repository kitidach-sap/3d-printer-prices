const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

async function seedData() {
    const dataPath = path.join(__dirname, '..', 'data', 'products.json');
    const products = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

    console.log(`Seeding ${products.length} products to Supabase...`);

    // Insert in batches of 500 (Supabase limit)
    const BATCH_SIZE = 500;
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

        const { data, error } = await supabase
            .from('disk_products')
            .upsert(batch, { onConflict: 'asin,locale' });

        if (error) {
            console.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} error:`, error.message);
            errors += batch.length;
        } else {
            inserted += batch.length;
            console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} products upserted (${inserted}/${products.length})`);
        }
    }

    console.log(`\n=== Seed Complete ===`);
    console.log(`Inserted/Updated: ${inserted}`);
    console.log(`Errors: ${errors}`);
}

seedData().catch(console.error);
