/**
 * PipZoNe — Signup Supabase Auth
 * Page Group 1: /signup/
 * Supabase authentication operations.
 */

const supabaseClient = window.supabaseClient || supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

/* ====================================================================
   1. Create Account
==================================================================== */
async function signUpUser(email,password,partnerCode){
  return await supabaseClient.auth.signUp({
    email:email,
    password:password,
    options:{
      data:{
        role:'client',
        profit_split:'60/40',
        partner_code:partnerCode||null
      }
    }
  });
}

/* ====================================================================
   2. Verify Signup Email OTP
==================================================================== */
async function verifySignupOtp(email,token){
  return await supabaseClient.auth.verifyOtp({
    email:email,
    token:token,
    type:'signup'
  });
}

/* ====================================================================
   3. Resend Signup Email OTP
==================================================================== */
async function resendSignupOtp(email){
  return await supabaseClient.auth.resend({
    type:'signup',
    email:email
  });
}

/* ====================================================================
   4. Get Current Session
==================================================================== */
async function getCurrentSession(){
  return await supabaseClient.auth.getSession();
}

/* ====================================================================
   5. Sign Out
==================================================================== */
async function signOutUser(){
  return await supabaseClient.auth.signOut();
}