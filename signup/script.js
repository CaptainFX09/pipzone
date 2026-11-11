/**
 * PipZoNe — Signup Page Logic
 * Page Group 1: /signup/
 * UI, form validation, password rules, referral code and Email OTP UI.
 */

document.addEventListener('DOMContentLoaded',()=>{
  initThemeToggle();
  initReferralPrefill();
  initPasswordToggles();
  initPasswordStrengthCheck();
  initSignupForm();
});

/* ====================================================================
   1. Theme Toggle System
==================================================================== */

function initThemeToggle(){
  const themeToggleBtn=document.getElementById('themeToggleBtn');
  if(!themeToggleBtn)return;

  const currentTheme=localStorage.getItem('pipzone_theme')||'dark';

  document.documentElement.setAttribute(
    'data-theme',
    currentTheme
  );

  themeToggleBtn.addEventListener('click',()=>{
    const isDark=
      document.documentElement.getAttribute('data-theme')==='dark';

    const nextTheme=isDark?'light':'dark';

    document.documentElement.setAttribute(
      'data-theme',
      nextTheme
    );

    localStorage.setItem(
      'pipzone_theme',
      nextTheme
    );
  });
}

/* ====================================================================
   2. Referral / Partner Code Prefill
   Reads ?ref= or ?partner= from the URL.
==================================================================== */

function initReferralPrefill(){
  const partnerInput=
    document.getElementById('partnerCodeInput');

  const appliedBadge=
    document.getElementById('partnerAppliedBadge');

  if(!partnerInput)return;

  const urlParams=
    new URLSearchParams(window.location.search);

  const refCode=
    urlParams.get('ref')||
    urlParams.get('partner');

  if(refCode){
    partnerInput.value=
      refCode.trim().toUpperCase();

    if(appliedBadge){
      appliedBadge.classList.remove('hidden');
    }
  }
}

/* ====================================================================
   3. Password Visibility Toggles
==================================================================== */

function initPasswordToggles(){
  const setupToggle=(btnId,inputId)=>{
    const btn=document.getElementById(btnId);
    const input=document.getElementById(inputId);

    if(!btn||!input)return;

    const eyeOpen=
      btn.querySelector('.eye-open');

    const eyeClosed=
      btn.querySelector('.eye-closed');

    btn.addEventListener('click',()=>{
      const isPassword=
        input.type==='password';

      input.type=
        isPassword?'text':'password';

      if(eyeOpen&&eyeClosed){
        eyeOpen.classList.toggle(
          'hidden',
          isPassword
        );

        eyeClosed.classList.toggle(
          'hidden',
          !isPassword
        );
      }
    });
  };

  setupToggle(
    'togglePasswordBtn',
    'passwordInput'
  );

  setupToggle(
    'toggleConfirmPasswordBtn',
    'confirmPasswordInput'
  );
}

/* ====================================================================
   4. Live Password Strength Checker
   Requirements:
   - 8 to 15 characters
   - Uppercase + lowercase
   - Number
   - Special character
==================================================================== */

let isPasswordValid=false;

function initPasswordStrengthCheck(){
  const passwordInput=
    document.getElementById('passwordInput');

  const charCounter=
    document.getElementById('charCounter');

  const ruleLength=
    document.getElementById('ruleLength');

  const ruleCase=
    document.getElementById('ruleCase');

  const ruleNumber=
    document.getElementById('ruleNumber');

  const ruleSpecial=
    document.getElementById('ruleSpecial');

  if(!passwordInput)return;

  passwordInput.addEventListener('input',()=>{
    const val=passwordInput.value;
    const len=val.length;

    /* ---------------------------------------------------------------
       Character Counter
    --------------------------------------------------------------- */

    if(charCounter){
      charCounter.textContent=
        `${len} / 15 chars`;

      charCounter.style.color=
        len>15?
        'var(--accent-loss)':
        'var(--text-muted)';
    }

    /* ---------------------------------------------------------------
       Length Rule
    --------------------------------------------------------------- */

    const hasLength=
      len>=8&&
      len<=15;

    updateRule(
      ruleLength,
      hasLength
    );

    /* ---------------------------------------------------------------
       Uppercase + Lowercase Rule
    --------------------------------------------------------------- */

    const hasCase=
      /[A-Z]/.test(val)&&
      /[a-z]/.test(val);

    updateRule(
      ruleCase,
      hasCase
    );

    /* ---------------------------------------------------------------
       Number Rule
    --------------------------------------------------------------- */

    const hasNumber=
      /[0-9]/.test(val);

    updateRule(
      ruleNumber,
      hasNumber
    );

    /* ---------------------------------------------------------------
       Special Character Rule
    --------------------------------------------------------------- */

    const hasSpecial=
      /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(val);

    updateRule(
      ruleSpecial,
      hasSpecial
    );

    /* ---------------------------------------------------------------
       Final Password Validation
    --------------------------------------------------------------- */

    isPasswordValid=
      hasLength&&
      hasCase&&
      hasNumber&&
      hasSpecial;
  });
}

/* ====================================================================
   5. Password Rule UI Helper
==================================================================== */

function updateRule(element,isValid){
  if(!element)return;

  if(isValid){
    element.classList.add('valid');
  }else{
    element.classList.remove('valid');
  }
}

/* ====================================================================
   6. Signup Form
   Handles:
   - Email validation
   - Password validation
   - Confirm password
   - Partner code
   - Supabase signup through signup/supabase-auth.js
==================================================================== */

function initSignupForm(){
  const form=
    document.getElementById('signupForm');

  const emailInput=
    document.getElementById('emailInput');

  const passwordInput=
    document.getElementById('passwordInput');

  const confirmPasswordInput=
    document.getElementById('confirmPasswordInput');

  const partnerCodeInput=
    document.getElementById('partnerCodeInput');

  const emailError=
    document.getElementById('emailError');

  const confirmPasswordError=
    document.getElementById('confirmPasswordError');

  const submitBtn=
    document.getElementById('createAccountBtn');

  const statusAlert=
    document.getElementById('statusAlert');

  if(
    !form||
    !emailInput||
    !passwordInput||
    !confirmPasswordInput||
    !submitBtn
  ){
    return;
  }

  /* ---------------------------------------------------------------
     Confirm Password Live Check
  --------------------------------------------------------------- */

  confirmPasswordInput.addEventListener('input',()=>{
    if(
      confirmPasswordInput.value&&
      passwordInput.value!==confirmPasswordInput.value
    ){
      confirmPasswordError.textContent=
        'Passwords do not match';
    }else{
      confirmPasswordError.textContent='';
    }
  });

  /* ---------------------------------------------------------------
     Signup Form Submit
  --------------------------------------------------------------- */

  form.addEventListener('submit',async e=>{
    e.preventDefault();

    emailError.textContent='';
    confirmPasswordError.textContent='';

    hideAlert();

    const email=
      emailInput.value.trim().toLowerCase();

    const password=
      passwordInput.value;

    const confirmPassword=
      confirmPasswordInput.value;

    const partnerCode=
      partnerCodeInput?
      partnerCodeInput.value.trim().toUpperCase():
      '';

    const emailRegex=
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    /* -------------------------------------------------------------
       Email Validation
    ------------------------------------------------------------- */

    if(
      !email||
      !emailRegex.test(email)
    ){
      emailError.textContent=
        'Please enter a valid email address';

      emailInput.focus();
      return;
    }

    /* -------------------------------------------------------------
       Password Validation
    ------------------------------------------------------------- */

    if(!isPasswordValid){
      showAlert(
        'error',
        'Please fulfill all password strength requirements before proceeding.'
      );

      passwordInput.focus();
      return;
    }

    /* -------------------------------------------------------------
       Confirm Password Validation
    ------------------------------------------------------------- */

    if(password!==confirmPassword){
      confirmPasswordError.textContent=
        'Passwords do not match';

      confirmPasswordInput.focus();
      return;
    }

    setLoadingState(true);

    try{
      console.log(
        '[PipZoNe Signup] Creating account for:',
        email
      );

      /* -----------------------------------------------------------
         Supabase Signup
         Function comes from signup/supabase-auth.js
      ----------------------------------------------------------- */

      const{data,error}=
        await signUpUser(
          email,
          password,
          partnerCode
        );

      /* -----------------------------------------------------------
         Supabase Signup Error
      ----------------------------------------------------------- */

      if(error){
        console.error(
          '[PipZoNe Signup] Supabase error:',
          error
        );

        showAlert(
          'error',
          getSignupErrorMessage(error)
        );

        setLoadingState(false);
        return;
      }

      console.log(
        '[PipZoNe Signup] Supabase response:',
        data
      );

      /* -----------------------------------------------------------
         Existing / Already Registered Email
      ----------------------------------------------------------- */

      if(
        data&&
        data.user&&
        Array.isArray(data.user.identities)&&
        data.user.identities.length===0
      ){
        console.warn(
          '[PipZoNe Signup] Email may already be registered:',
          email
        );

        showAlert(
          'error',
          'An account with this email already exists. Please sign in instead.'
        );

        setLoadingState(false);
        return;
      }

      /* -----------------------------------------------------------
         No User Returned
      ----------------------------------------------------------- */

      if(!data||!data.user){
        console.error(
          '[PipZoNe Signup] No user returned from Supabase.'
        );

        showAlert(
          'error',
          'Account could not be created. Please try again.'
        );

        setLoadingState(false);
        return;
      }

      console.log(
        '[PipZoNe Signup] Account created successfully.'
      );

      console.log(
        '[PipZoNe Signup] Confirmation email should be sent to:',
        email
      );

      setLoadingState(false);

      /* -----------------------------------------------------------
         Reset Signup Form
      ----------------------------------------------------------- */

      form.reset();

      isPasswordValid=false;

      /* -----------------------------------------------------------
         Open Email OTP Popup
      ----------------------------------------------------------- */

      openOtpModal(email);

    }catch(error){
      console.error(
        '[PipZoNe Signup] Unexpected error:',
        error
      );

      showAlert(
        'error',
        'Unable to create your account right now. Please try again.'
      );

      setLoadingState(false);
    }
  });

  /* ================================================================
     6.1 Signup Loading State
  ================================================================ */

  function setLoadingState(isLoading){
    const btnText=
      submitBtn.querySelector('.btn-text');

    const btnSpinner=
      submitBtn.querySelector('.btn-spinner');

    submitBtn.disabled=isLoading;

    if(isLoading){
      if(btnText){
        btnText.textContent=
          'Creating account...';
      }

      if(btnSpinner){
        btnSpinner.classList.remove('hidden');
      }
    }else{
      if(btnText){
        btnText.textContent=
          'Create account';
      }

      if(btnSpinner){
        btnSpinner.classList.add('hidden');
      }
    }
  }

  /* ================================================================
     6.2 Status Alert
  ================================================================ */

  function showAlert(type,message){
    if(!statusAlert)return;

    statusAlert.className=
      `alert-box ${type}`;

    const textSpan=
      statusAlert.querySelector('.alert-text')||
      statusAlert;

    textSpan.textContent=message;

    statusAlert.classList.remove('hidden');
  }

  function hideAlert(){
    if(!statusAlert)return;

    statusAlert.classList.add('hidden');
  }

  /* ================================================================
     6.3 Signup Error Messages
  ================================================================ */

  function getSignupErrorMessage(error){
    const message=
      (error.message||'').toLowerCase();

    if(
      message.includes('already registered')||
      message.includes('already exists')||
      message.includes('user already registered')
    ){
      return(
        'An account with this email already exists. Please sign in instead.'
      );
    }

    if(
      message.includes('invalid email')
    ){
      return(
        'Please enter a valid email address.'
      );
    }

    if(
      message.includes('password')
    ){
      return(
        'Password does not meet the required security rules.'
      );
    }

    if(
      message.includes('rate limit')||
      message.includes('too many requests')
    ){
      return(
        'Too many signup attempts. Please wait and try again.'
      );
    }

    if(
      message.includes('fetch')||
      message.includes('network')||
      message.includes('failed to fetch')
    ){
      return(
        'Connection error. Please check your internet connection and try again.'
      );
    }

    return(
      error.message||
      'Unable to create your account. Please try again.'
    );
  }
}

/* ====================================================================
   7. Email OTP Popup
   Handles:
   - 6-digit OTP input
   - Auto focus
   - Paste
   - Backspace
   - Verification
   - Resend
   - 60-second countdown
==================================================================== */

function openOtpModal(email){
  const otpModal=
    document.getElementById('otpModal');

  const otpEmailDisplay=
    document.getElementById('otpEmailDisplay');

  const verifyOtpBtn=
    document.getElementById('verifyOtpBtn');

  const resendOtpBtn=
    document.getElementById('resendOtpBtn');

  const otpStatus=
    document.getElementById('otpStatus');

  if(
    !otpModal||
    !verifyOtpBtn||
    !resendOtpBtn||
    !otpStatus
  ){
    console.error(
      '[PipZoNe OTP] OTP modal elements are missing.'
    );

    return;
  }

  if(otpEmailDisplay){
    otpEmailDisplay.textContent=email;
  }

  otpModal.classList.remove('hidden');

  otpModal.setAttribute(
    'aria-hidden',
    'false'
  );

  const otpInputs=[
    ...otpModal.querySelectorAll(
      '.otp-inputs input'
    )
  ];

  if(otpInputs.length!==6){
    console.error(
      '[PipZoNe OTP] Expected 6 OTP inputs, found:',
      otpInputs.length
    );
  }

  let resendCountdown=60;
  let resendTimer=null;

  /* ================================================================
     7.1 Clear OTP Status
  ================================================================ */

  function clearOtpStatus(){
    otpStatus.textContent='';

    otpStatus.className=
      'otp-status hidden';
  }

  /* ================================================================
     7.2 Clear OTP Inputs
  ================================================================ */

  function clearOtpInputs(){
    otpInputs.forEach(input=>{
      input.value='';
    });

    if(otpInputs[0]){
      otpInputs[0].focus();
    }
  }

  /* ================================================================
     7.3 OTP Input Behaviour
  ================================================================ */

  otpInputs.forEach((input,index)=>{
    input.value='';

    /* --------------------------------------------------------------
       Typing / Autofill
    -------------------------------------------------------------- */

    input.oninput=()=>{
      const value=
        input.value.replace(/\D/g,'');

      if(value.length>1){
        const digits=
          value.slice(0,6);

        otpInputs.forEach((box,i)=>{
          box.value=
            digits[i]||
            '';
        });

        const focusIndex=
          Math.min(
            digits.length,
            otpInputs.length-1
          );

        if(otpInputs[focusIndex]){
          otpInputs[focusIndex].focus();
        }

        return;
      }

      input.value=
        value.slice(0,1);

      if(
        input.value&&
        index<otpInputs.length-1
      ){
        otpInputs[index+1].focus();
      }
    };

    /* --------------------------------------------------------------
       Paste Full 6-Digit Code
    -------------------------------------------------------------- */

    input.onpaste=e=>{
      e.preventDefault();

      const pastedCode=
        (e.clipboardData||
        window.clipboardData)
        .getData('text')
        .replace(/\D/g,'')
        .slice(0,6);

      if(!pastedCode){
        return;
      }

      otpInputs.forEach((box,i)=>{
        box.value=
          pastedCode[i]||
          '';
      });

      const focusIndex=
        Math.min(
          pastedCode.length,
          otpInputs.length-1
        );

      if(otpInputs[focusIndex]){
        otpInputs[focusIndex].focus();
      }
    };

    /* --------------------------------------------------------------
       Backspace → Previous Box
    -------------------------------------------------------------- */

    input.onkeydown=e=>{
      if(
        e.key==='Backspace'&&
        !input.value&&
        index>0
      ){
        otpInputs[index-1].focus();
      }
    };
  });

  /* ================================================================
     7.4 Verify OTP
  ================================================================ */

  verifyOtpBtn.onclick=async()=>{
    const token=
      otpInputs
      .map(input=>input.value)
      .join('');

    if(token.length!==6){
      otpStatus.textContent=
        'Please enter the complete 6-digit code.';

      otpStatus.className=
        'otp-status error';

      return;
    }

    verifyOtpBtn.disabled=true;

    otpStatus.textContent=
      'Verifying code...';

    otpStatus.className=
      'otp-status';

    try{
      console.log(
        '[PipZoNe OTP] Verifying code for:',
        email
      );

      /* ------------------------------------------------------------
         Supabase OTP Verification
         Function comes from signup/supabase-auth.js
      ------------------------------------------------------------ */

      const{data,error}=
        await verifySignupOtp(
          email,
          token
        );

      if(error){
        console.error(
          '[PipZoNe OTP] Verification error:',
          error
        );

        otpStatus.textContent=
          getOtpErrorMessage(error);

        otpStatus.className=
          'otp-status error';

        verifyOtpBtn.disabled=false;

        return;
      }

      console.log(
        '[PipZoNe OTP] Email verification successful:',
        data
      );

      otpStatus.textContent=
        'Email verified successfully.';

      otpStatus.className=
        'otp-status success';

      clearInterval(resendTimer);

      resendOtpBtn.disabled=true;

      /* ------------------------------------------------------------
         Redirect to Sign In
      ------------------------------------------------------------ */

      setTimeout(()=>{
        window.location.href='../signin/';
      },1200);

    }catch(error){
      console.error(
        '[PipZoNe OTP] Unexpected verification error:',
        error
      );

      otpStatus.textContent=
        'Unable to verify the code. Please try again.';

      otpStatus.className=
        'otp-status error';

      verifyOtpBtn.disabled=false;
    }
  };

  /* ================================================================
     7.5 Resend OTP
  ================================================================ */

  resendOtpBtn.onclick=async()=>{
    if(resendOtpBtn.disabled){
      return;
    }

    resendOtpBtn.disabled=true;

    otpStatus.textContent=
      'Sending a new verification code...';

    otpStatus.className=
      'otp-status';

    try{
      console.log(
        '[PipZoNe OTP] Resending verification code to:',
        email
      );

      /* ------------------------------------------------------------
         Supabase OTP Resend
         Function comes from signup/supabase-auth.js
      ------------------------------------------------------------ */

      const{data,error}=
        await resendSignupOtp(email);

      if(error){
        console.error(
          '[PipZoNe OTP] Resend error:',
          error
        );

        otpStatus.textContent=
          getOtpErrorMessage(error);

        otpStatus.className=
          'otp-status error';

        resendOtpBtn.disabled=false;

        resendOtpBtn.textContent=
          'Resend Code';

        return;
      }

      console.log(
        '[PipZoNe OTP] Verification code resent:',
        data
      );

      clearOtpInputs();

      otpStatus.textContent=
        'A new verification code has been sent.';

      otpStatus.className=
        'otp-status success';

      startResendCountdown();

    }catch(error){
      console.error(
        '[PipZoNe OTP] Unexpected resend error:',
        error
      );

      otpStatus.textContent=
        'Unable to resend the code. Please try again.';

      otpStatus.className=
        'otp-status error';

      resendOtpBtn.disabled=false;

      resendOtpBtn.textContent=
        'Resend Code';
    }
  };

  /* ================================================================
     7.6 60-Second Resend Countdown
  ================================================================ */

  function startResendCountdown(){
    clearInterval(resendTimer);

    resendCountdown=60;

    resendOtpBtn.disabled=true;

    resendOtpBtn.textContent=
      `Resend Code (${resendCountdown}s)`;

    resendTimer=setInterval(()=>{
      resendCountdown--;

      if(resendCountdown<=0){
        clearInterval(resendTimer);

        resendOtpBtn.disabled=false;

        resendOtpBtn.textContent=
          'Resend Code';

        return;
      }

      resendOtpBtn.textContent=
        `Resend Code (${resendCountdown}s)`;

    },1000);
  }

  /* ================================================================
     7.7 Initial OTP Countdown
  ================================================================ */

  clearOtpStatus();

  resendOtpBtn.disabled=true;

  resendOtpBtn.textContent=
    `Resend Code (${resendCountdown}s)`;

  clearInterval(resendTimer);

  resendTimer=setInterval(()=>{
    resendCountdown--;

    if(resendCountdown<=0){
      clearInterval(resendTimer);

      resendOtpBtn.disabled=false;

      resendOtpBtn.textContent=
        'Resend Code';

      return;
    }

    resendOtpBtn.textContent=
      `Resend Code (${resendCountdown}s)`;

  },1000);

  /* ================================================================
     7.8 Initial OTP Focus
  ================================================================ */

  setTimeout(()=>{
    if(otpInputs[0]){
      otpInputs[0].focus();
    }
  },100);
}

/* ====================================================================
   8. OTP Error Messages
==================================================================== */

function getOtpErrorMessage(error){
  const message=
    (error.message||'').toLowerCase();

  if(
    message.includes('expired')||
    message.includes('invalid')
  ){
    return(
      'Invalid or expired verification code.'
    );
  }

  if(
    message.includes('rate limit')||
    message.includes('too many')
  ){
    return(
      'Too many code requests. Please wait before trying again.'
    );
  }

  if(
    message.includes('network')||
    message.includes('fetch')
  ){
    return(
      'Connection error. Please check your internet connection and try again.'
    );
  }

  return(
    error.message||
    'Unable to process the verification code. Please try again.'
  );
}