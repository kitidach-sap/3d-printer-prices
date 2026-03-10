const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabaseKey = process.env.SUPABASE_SERVICE_KEY !== 'your-service-role-key-here'
    ? process.env.SUPABASE_SERVICE_KEY
    : process.env.SUPABASE_ANON_KEY;
const supabase = createClient(process.env.SUPABASE_URL, supabaseKey);

async function run() {
    console.log("Resetting printer_type for all products to trigger re-enrichment...");
    const { error } = await supabase
        .from('products')
        .update({ printer_type: null })
        .neq('id', '00000000-0000-0000-0000-000000000000'); // dummy condition to match all rows
        
    if (error) {
        console.error("Error:", error);
    } else {
        console.log("Successfully reset all products. They are now ready for re-enrichment.");
    }
}
run();
