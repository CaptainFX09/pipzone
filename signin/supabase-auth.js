/**
 * PipZoNe — Sign In Supabase Auth
 * Page Group 2: /signin/
 * Supabase authentication + password recovery.
 */

const supabaseClient = window.supabaseClient || supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);
/* ====================================================================
   1. Sign In
==================================================================== */
async function signInUser(email,password){
  return await supabaseClient.auth.signInWithPassword({
    email:email,
    password:password
  });
}

/* ====================================================================
   2. Send Password Recovery OTP
==================================================================== */
async function sendRecoveryOtp(email){
  return await supabaseClient.auth.resetPasswordForEmail(
    email
  );
}

/* ====================================================================
   3. Verify Password Recovery OTP
==================================================================== */
async function verifyRecoveryOtp(email,token){
  return await supabaseClient.auth.verifyOtp({
    email:email,
    token:token,
    type:'recovery'
  });
}

/* ====================================================================
   4. Resend Password Recovery OTP
==================================================================== */
async function resendRecoveryOtp(email){
  return await supabaseClient.auth.resetPasswordForEmail(
    email
  );
}

/* ====================================================================
   5. Update Password
==================================================================== */
async function updateUserPassword(password){
  return await supabaseClient.auth.updateUser({
    password:password
  });
}

/* ====================================================================
   6. Sign Out
==================================================================== */
async function signOutUser(){
  return await supabaseClient.auth.signOut();
}

/* ====================================================================
   7. Get Current Session
==================================================================== */
async function getCurrentSession(){
  return await supabaseClient.auth.getSession();
}