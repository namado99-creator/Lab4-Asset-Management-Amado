// =====================================================
// SUPABASE CONFIGURATION
// =====================================================

const SUPABASE_URL =
    "https://ucwkaqftvboyakdshxwt.supabase.co";

const SUPABASE_KEY =
    "sb_publishable_GTBMlg14yiioR-QCrxDCzg_O0Vli2l2";


// Create Supabase client
const supabaseClient =
    window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_KEY
    );


// Make the client available to all JavaScript files
window.supabaseClient =
    supabaseClient;