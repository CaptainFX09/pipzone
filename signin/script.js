/**
 * PipZoNe — Sign In Page Logic
 * Page Group 2: /signin/
 * UI + form handling + password recovery OTP interface.
 */

document.addEventListener('DOMContentLoaded',()=>{
  initThemeToggle();
  initPasswordToggle();
  initForgotPassword();
  initResetOtp();
  initSigninForm();
  checkExistingSession();
});

/* ====================================================================
   1. Theme Toggle System
==================================================================== */
function initThemeToggle(){
  const themeToggleBtn=document.getElementById('themeToggleBtn');
  if(!themeToggleBtn)return;

  const currentTheme=
    localStorage.getItem('pipzone_theme')||'dark';

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
   2. Main Password Visibility Toggle
==================================================================== */
function initPasswordToggle(){
  setupPasswordToggle(
    'togglePasswordBtn',
    'passwordInput'
  );
}

/* ====================================================================
   3. Forgot Password — Send OTP
==================================================================== */
function initForgotPassword(){
  const forgotBtn=
    document.getElementById('forgotPasswordBtn');

  const resetBox=
    document.getElementById('forgotPasswordBox');

  const sendResetBtn=
    document.getElementById('sendResetBtn');

  const resetEmailInput=
    document.getElementById('resetEmailInput');

  const resetFeedback=
    document.getElementById('resetFeedback');

  const emailInput=
    document.getElementById('emailInput');

  if(!forgotBtn||!resetBox)return;

  forgotBtn.addEventListener('click',()=>{
    const isHidden=
      resetBox.classList.contains('hidden');

    resetBox.classList.toggle(
      'hidden',
      !isHidden
    );

    if(isHidden&&resetEmailInput){
      if(emailInput&&emailInput.value){
        resetEmailInput.value=
          emailInput.value;
      }

      resetEmailInput.focus();
    }
  });

  if(!sendResetBtn||!resetEmailInput)return;

  sendResetBtn.addEventListener('click',async()=>{
    const email=
      resetEmailInput.value.trim().toLowerCase();

    if(!email||!isValidEmail(email)){
      showResetFeedback(
        'Please enter a valid recovery email.',
        'error'
      );

      resetEmailInput.focus();
      return;
    }

    setResetLoading(true);

    showResetFeedback(
      'Sending verification code...',
      'normal'
    );

    try{
      const{error}=
        await sendRecoveryOtp(email);

      if(error){
        console.error(
          '[PipZoNe Auth] Reset OTP error:',
          error
        );

        showResetFeedback(
          getAuthErrorMessage(error),
          'error'
        );

        setResetLoading(false);
        return;
      }

      console.log(
        '[PipZoNe Auth] Password reset OTP requested for:',
        email
      );

      setResetLoading(false);

      showResetFeedback(
        `A 6-digit verification code has been sent to ${email}.`,
        'success'
      );

      openResetOtpModal(email);

    }catch(error){
      console.error(
        '[PipZoNe Auth] Reset OTP unexpected error:',
        error
      );

      showResetFeedback(
        'Unable to send the verification code. Please try again.',
        'error'
      );

      setResetLoading(false);
    }
  });

  function setResetLoading(isLoading){
    sendResetBtn.disabled=isLoading;

    sendResetBtn.textContent=
      isLoading?
      'Sending OTP...':
      'Send OTP';
  }

  function showResetFeedback(message,type){
    if(!resetFeedback)return;

    resetFeedback.textContent=message;

    if(type==='error'){
      resetFeedback.style.color=
        'var(--accent-loss)';
    }else if(type==='success'){
      resetFeedback.style.color=
        'var(--accent-profit)';
    }else{
      resetFeedback.style.color=
        'var(--text-secondary)';
    }

    resetFeedback.classList.remove('hidden');
  }
}

/* ====================================================================
   4. Password Reset OTP
==================================================================== */
function initResetOtp(){
  const modal=
    document.getElementById('resetOtpModal');

  if(!modal)return;

  const closeBtn=
    document.getElementById('resetOtpCloseBtn');

  if(closeBtn){
    closeBtn.addEventListener(
      'click',
      ()=>closeResetOtpModal()
    );
  }

  const backdrop=
    modal.querySelector('.otp-modal-backdrop');

  if(backdrop){
    backdrop.addEventListener(
      'click',
      ()=>closeResetOtpModal()
    );
  }

  if(
    document.getElementById('toggleNewPasswordBtn')
  ){
    setupPasswordToggle(
      'toggleNewPasswordBtn',
      'newPasswordInput'
    );
  }

  if(
    document.getElementById('toggleConfirmNewPasswordBtn')
  ){
    setupPasswordToggle(
      'toggleConfirmNewPasswordBtn',
      'confirmNewPasswordInput'
    );
  }
}

/* ====================================================================
   5. Open Reset OTP Modal
==================================================================== */
function openResetOtpModal(email){
  const modal=
    document.getElementById('resetOtpModal');

  const emailDisplay=
    document.getElementById('resetOtpEmailDisplay');

  const verifyBtn=
    document.getElementById('verifyResetOtpBtn');

  const resendBtn=
    document.getElementById('resendResetOtpBtn');

  const status=
    document.getElementById('resetOtpStatus');

  const otpInputs=
    modal?
    [...modal.querySelectorAll('.otp-inputs input')]:
    [];

  if(
    !modal||
    !verifyBtn||
    !resendBtn||
    !status
  ){
    console.error(
      '[PipZoNe OTP] Reset OTP modal elements are missing.'
    );
    return;
  }

  if(emailDisplay){
    emailDisplay.textContent=email;
  }

  modal.classList.remove('hidden');

  modal.setAttribute(
    'aria-hidden',
    'false'
  );

  const newPasswordBox=
    document.getElementById('newPasswordBox');

  if(newPasswordBox){
    newPasswordBox.classList.add('hidden');
  }

  clearResetOtpStatus();
  clearOtpInputs(otpInputs);

  verifyBtn.disabled=false;

  resendBtn.disabled=true;

  let resendCountdown=60;
  let resendTimer=null;

  /* --------------------------------------------------------------
     OTP Input Behaviour
  -------------------------------------------------------------- */
  otpInputs.forEach((input,index)=>{
    input.value='';

    input.oninput=()=>{
      const value=
        input.value.replace(/\D/g,'');

      if(value.length>1){
        const digits=
          value.slice(0,6);

        otpInputs.forEach((box,i)=>{
          box.value=
            digits[i]||'';
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

    input.onpaste=e=>{
      e.preventDefault();

      const pastedCode=
        (e.clipboardData||window.clipboardData)
          .getData('text')
          .replace(/\D/g,'')
          .slice(0,6);

      if(!pastedCode)return;

      otpInputs.forEach((box,i)=>{
        box.value=
          pastedCode[i]||'';
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

  /* --------------------------------------------------------------
     Start Initial Countdown
  -------------------------------------------------------------- */
  startResendCountdown();

  /* --------------------------------------------------------------
     Verify Reset OTP
  -------------------------------------------------------------- */
  verifyBtn.onclick=async()=>{
    const token=
      otpInputs
        .map(input=>input.value)
        .join('');

    if(token.length!==6){
      status.textContent=
        'Please enter the complete 6-digit code.';

      status.className=
        'otp-status error';

      return;
    }

    verifyBtn.disabled=true;

    status.textContent=
      'Verifying code...';

    status.className=
      'otp-status';

    try{
      console.log(
        '[PipZoNe OTP] Verifying recovery code for:',
        email
      );

      const{data,error}=
        await verifyRecoveryOtp(
          email,
          token
        );

      if(error){
        console.error(
          '[PipZoNe OTP] Recovery verification error:',
          error
        );

        status.textContent=
          getOtpErrorMessage(error);

        status.className=
          'otp-status error';

        verifyBtn.disabled=false;
        return;
      }

      console.log(
        '[PipZoNe OTP] Recovery verification successful:',
        data
      );

      clearInterval(resendTimer);

      resendBtn.disabled=true;
      resendBtn.textContent='Code Verified';

      status.textContent=
        'Code verified. Enter your new password.';

      status.className=
        'otp-status success';

      showNewPasswordSection();

    }catch(error){
      console.error(
        '[PipZoNe OTP] Unexpected verification error:',
        error
      );

      status.textContent=
        'Unable to verify the code. Please try again.';

      status.className=
        'otp-status error';

      verifyBtn.disabled=false;
    }
  };

  /* --------------------------------------------------------------
     Resend Reset OTP
  -------------------------------------------------------------- */
  resendBtn.onclick=async()=>{
    if(resendBtn.disabled)return;

    resendBtn.disabled=true;

    status.textContent=
      'Sending a new verification code...';

    status.className=
      'otp-status';

    try{
      console.log(
        '[PipZoNe OTP] Resending recovery code to:',
        email
      );

      const{error}=
        await resendRecoveryOtp(email);

      if(error){
        console.error(
          '[PipZoNe OTP] Recovery resend error:',
          error
        );

        status.textContent=
          getOtpErrorMessage(error);

        status.className=
          'otp-status error';

        resendBtn.disabled=false;
        resendBtn.textContent='Resend Code';

        return;
      }

      console.log(
        '[PipZoNe OTP] Recovery code resent:',
        email
      );

      clearOtpInputs(otpInputs);

      status.textContent=
        'A new verification code has been sent.';

      status.className=
        'otp-status success';

      startResendCountdown();

    }catch(error){
      console.error(
        '[PipZoNe OTP] Unexpected resend error:',
        error
      );

      status.textContent=
        'Unable to resend the code. Please try again.';

      status.className=
        'otp-status error';

      resendBtn.disabled=false;
      resendBtn.textContent='Resend Code';
    }
  };

  /* --------------------------------------------------------------
     Countdown
  -------------------------------------------------------------- */
  function startResendCountdown(){
    clearInterval(resendTimer);

    resendCountdown=60;

    resendBtn.disabled=true;

    resendBtn.textContent=
      `Resend Code (${resendCountdown}s)`;

    resendTimer=setInterval(()=>{
      resendCountdown--;

      if(resendCountdown<=0){
        clearInterval(resendTimer);

        resendBtn.disabled=false;

        resendBtn.textContent=
          'Resend Code';

        return;
      }

      resendBtn.textContent=
        `Resend Code (${resendCountdown}s)`;

    },1000);
  }

  /* --------------------------------------------------------------
     New Password
  -------------------------------------------------------------- */
  const updatePasswordBtn=
    document.getElementById('updatePasswordBtn');

  const newPasswordInput=
    document.getElementById('newPasswordInput');

  const confirmNewPasswordInput=
    document.getElementById(
      'confirmNewPasswordInput'
    );

  const newPasswordError=
    document.getElementById(
      'newPasswordError'
    );

  const confirmNewPasswordError=
    document.getElementById(
      'confirmNewPasswordError'
    );

  if(confirmNewPasswordInput){
    confirmNewPasswordInput.oninput=()=>{
      if(
        confirmNewPasswordInput.value&&
        newPasswordInput.value!==confirmNewPasswordInput.value
      ){
        confirmNewPasswordError.textContent=
          'Passwords do not match';
      }else{
        confirmNewPasswordError.textContent='';
      }
    };
  }

  if(updatePasswordBtn){
    updatePasswordBtn.onclick=async()=>{
      if(newPasswordError){
        newPasswordError.textContent='';
      }

      if(confirmNewPasswordError){
        confirmNewPasswordError.textContent='';
      }

      const newPassword=
        newPasswordInput?
        newPasswordInput.value:
        '';

      const confirmPassword=
        confirmNewPasswordInput?
        confirmNewPasswordInput.value:
        '';

      /* ------------------------------------------------------------
         Password Validation
      ------------------------------------------------------------ */
      if(!isStrongPassword(newPassword)){
        if(newPasswordError){
          newPasswordError.textContent=
            'Password must be 8–15 characters and include uppercase, lowercase, number and special character.';
        }

        if(newPasswordInput){
          newPasswordInput.focus();
        }

        return;
      }

      if(newPassword!==confirmPassword){
        if(confirmNewPasswordError){
          confirmNewPasswordError.textContent=
            'Passwords do not match';
        }

        if(confirmNewPasswordInput){
          confirmNewPasswordInput.focus();
        }

        return;
      }

      setUpdatePasswordLoading(
        updatePasswordBtn,
        true
      );

      status.textContent=
        'Updating your password...';

      status.className=
        'otp-status';

      try{
        const{error}=
          await updateUserPassword(
            newPassword
          );

        if(error){
          console.error(
            '[PipZoNe Auth] Password update error:',
            error
          );

          status.textContent=
            getAuthErrorMessage(error);

          status.className=
            'otp-status error';

          setUpdatePasswordLoading(
            updatePasswordBtn,
            false
          );

          return;
        }

        console.log(
          '[PipZoNe Auth] Password updated successfully.'
        );

        status.textContent=
          'Password updated successfully. Redirecting to sign in...';

        status.className=
          'otp-status success';

        setUpdatePasswordLoading(
          updatePasswordBtn,
          false
        );

        setTimeout(async()=>{
          await signOutUser();

          window.location.href=
            './index.html';
        },1200);

      }catch(error){
        console.error(
          '[PipZoNe Auth] Unexpected password update error:',
          error
        );

        status.textContent=
          'Unable to update your password. Please try again.';

        status.className=
          'otp-status error';

        setUpdatePasswordLoading(
          updatePasswordBtn,
          false
        );
      }
    };
  }

  setTimeout(()=>{
    if(otpInputs[0]){
      otpInputs[0].focus();
    }
  },100);
}

/* ====================================================================
   6. Show New Password Section
==================================================================== */
function showNewPasswordSection(){
  const otpInputs=
    document.getElementById('resetOtpInputs');

  const verifyBtn=
    document.getElementById('verifyResetOtpBtn');

  const resendText=
    document.querySelector(
      '#resetOtpModal .otp-resend-text'
    );

  const newPasswordBox=
    document.getElementById('newPasswordBox');

  if(otpInputs){
    otpInputs.classList.add('hidden');
  }

  if(verifyBtn){
    verifyBtn.classList.add('hidden');
  }

  if(resendText){
    resendText.classList.add('hidden');
  }

  if(newPasswordBox){
    newPasswordBox.classList.remove('hidden');

    const newPasswordInput=
      document.getElementById(
        'newPasswordInput'
      );

    if(newPasswordInput){
      setTimeout(()=>{
        newPasswordInput.focus();
      },100);
    }
  }
}

/* ====================================================================
   7. Close Reset OTP Modal
==================================================================== */
function closeResetOtpModal(){
  const modal=
    document.getElementById('resetOtpModal');

  if(!modal)return;

  modal.classList.add('hidden');

  modal.setAttribute(
    'aria-hidden',
    'true'
  );
}

/* ====================================================================
   8. OTP Helpers
==================================================================== */
function clearOtpInputs(inputs){
  if(!inputs)return;

  inputs.forEach(input=>{
    input.value='';
  });

  if(inputs[0]){
    inputs[0].focus();
  }
}

function clearResetOtpStatus(){
  const status=
    document.getElementById('resetOtpStatus');

  if(!status)return;

  status.textContent='';

  status.className=
    'otp-status hidden';
}

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

/* ====================================================================
   10. Sign In Form
==================================================================== */
function initSigninForm(){
  const form=
    document.getElementById('signinForm');

  const emailInput=
    document.getElementById('emailInput');

  const passwordInput=
    document.getElementById('passwordInput');

  const emailError=
    document.getElementById('emailError');

  const passwordError=
    document.getElementById('passwordError');

  const loginBtn=
    document.getElementById('loginBtn');

  const statusAlert=
    document.getElementById('statusAlert');

  const rememberMe=
    document.getElementById('rememberMe');

  if(
    !form||
    !emailInput||
    !passwordInput||
    !loginBtn
  ){
    return;
  }

  form.addEventListener(
    'submit',
    async e=>{
      e.preventDefault();

      if(emailError){
        emailError.textContent='';
      }

      if(passwordError){
        passwordError.textContent='';
      }

      hideAlert();

      const email=
        emailInput.value.trim().toLowerCase();

      const password=
        passwordInput.value;

      if(!email||!isValidEmail(email)){
        if(emailError){
          emailError.textContent=
            'Please enter a valid email address';
        }

        emailInput.focus();
        return;
      }

      if(!password){
        if(passwordError){
          passwordError.textContent=
            'Password is required';
        }

        passwordInput.focus();
        return;
      }

      setLoadingState(true);

      try{
        console.log(
          '[PipZoNe Auth] Signing in:',
          email
        );

        const{data,error}=
          await signInUser(
            email,
            password
          );

        if(error){
          console.error(
            '[PipZoNe Auth] Sign in error:',
            error
          );

          showAlert(
            'error',
            getLoginErrorMessage(error)
          );

          setLoadingState(false);
          return;
        }

        if(
          !data||
          !data.user||
          !data.session
        ){
          console.error(
            '[PipZoNe Auth] Login returned no valid session.'
          );

          showAlert(
            'error',
            'Unable to create a secure login session. Please try again.'
          );

          setLoadingState(false);
          return;
        }

        console.log(
          '[PipZoNe Auth] Login successful:',
          data.user.email
        );

        if(rememberMe){
          localStorage.setItem(
            'pipzone_remember_me',
            rememberMe.checked?
            'true':
            'false'
          );
        }

        showAlert(
          'success',
          'Login successful. Redirecting to your Client Dashboard...'
        );

        setLoadingState(false);

        setTimeout(()=>{
          window.location.href=
            '../client/index.html';
        },900);

      }catch(error){
        console.error(
          '[PipZoNe Auth] Unexpected sign in error:',
          error
        );

        showAlert(
          'error',
          'Unable to sign in right now. Please try again.'
        );

        setLoadingState(false);
      }
    }
  );

  function setLoadingState(isLoading){
    const btnText=
      loginBtn.querySelector('.btn-text');

    const btnSpinner=
      loginBtn.querySelector('.btn-spinner');

    loginBtn.disabled=isLoading;

    if(isLoading){
      if(btnText){
        btnText.textContent=
          'Authenticating...';
      }

      if(btnSpinner){
        btnSpinner.classList.remove('hidden');
      }
    }else{
      if(btnText){
        btnText.textContent=
          'Login to Dashboard';
      }

      if(btnSpinner){
        btnSpinner.classList.add('hidden');
      }
    }
  }

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
}

/* ====================================================================
   11. Password Toggle Helper
==================================================================== */
function setupPasswordToggle(btnId,inputId){
  const btn=
    document.getElementById(btnId);

  const input=
    document.getElementById(inputId);

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
}

/* ====================================================================
   12. Strong Password Validation
==================================================================== */
function isStrongPassword(password){
  if(password.length<8||password.length>15){
    return false;
  }

  const hasUpper=/[A-Z]/.test(password);
  const hasLower=/[a-z]/.test(password);
  const hasNumber=/[0-9]/.test(password);
  const hasSpecial=
    /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(
      password
    );

  return(
    hasUpper&&
    hasLower&&
    hasNumber&&
    hasSpecial
  );
}

/* ====================================================================
   13. Update Password Loading
==================================================================== */
function setUpdatePasswordLoading(
  button,
  isLoading
){
  if(!button)return;

  const btnText=
    button.querySelector('.btn-text');

  const btnSpinner=
    button.querySelector('.btn-spinner');

  button.disabled=isLoading;

  if(isLoading){
    if(btnText){
      btnText.textContent=
        'Updating password...';
    }

    if(btnSpinner){
      btnSpinner.classList.remove('hidden');
    }
  }else{
    if(btnText){
      btnText.textContent=
        'Update Password';
    }

    if(btnSpinner){
      btnSpinner.classList.add('hidden');
    }
  }
}

/* ====================================================================
   14. Existing Session Check
==================================================================== */
async function checkExistingSession(){
  try{
    const{data,error}=
      await getCurrentSession();

    if(error){
      console.error(
        '[PipZoNe Auth] Session check error:',
        error
      );

      return;
    }

    if(
      data&&
      data.session&&
      data.session.user
    ){
      console.log(
        '[PipZoNe Auth] Existing session detected:',
        data.session.user.email
      );
    }

  }catch(error){
    console.error(
      '[PipZoNe Auth] Unexpected session check error:',
      error
    );
  }
}

/* ====================================================================
   15. Email Validation
==================================================================== */
function isValidEmail(email){
  return(
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  );
}

/* ====================================================================
   16. Login Error Messages
==================================================================== */
function getLoginErrorMessage(error){
  const message=
    (error.message||'').toLowerCase();

  if(
    message.includes('invalid login credentials')||
    message.includes('invalid credentials')
  ){
    return(
      'Invalid email or password.'
    );
  }

  if(
    message.includes('email not confirmed')||
    message.includes('email_not_confirmed')
  ){
    return(
      'Please verify your email address before signing in.'
    );
  }

  if(
    message.includes('user not found')
  ){
    return(
      'No account was found with this email address.'
    );
  }

  if(
    message.includes('too many requests')||
    message.includes('rate limit')
  ){
    return(
      'Too many login attempts. Please wait and try again.'
    );
  }

  if(
    message.includes('network')||
    message.includes('fetch')||
    message.includes('connection')
  ){
    return(
      'Connection error. Please check your internet connection and try again.'
    );
  }

  return(
    error.message||
    'Unable to sign in. Please check your email and password.'
  );
}

/* ====================================================================
   17. General Auth Error Messages
==================================================================== */
function getAuthErrorMessage(error){
  const message=
    (error.message||'').toLowerCase();

  if(
    message.includes('invalid email')
  ){
    return(
      'Please enter a valid email address.'
    );
  }

  if(
    message.includes('rate limit')||
    message.includes('too many requests')
  ){
    return(
      'Too many requests. Please wait and try again.'
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
    'Unable to process your request. Please try again.'
  );
}