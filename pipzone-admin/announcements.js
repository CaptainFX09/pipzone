/* =========================================================
   PIPZONE ADMIN — ANNOUNCEMENTS PAGE LOGIC
   =========================================================
   Table of contents:
   1. Supabase client setup
   2. Helpers (DOM shortcut, escape, constants)
   3. UI messages (top banner + login banner)
   4. Password show/hide toggle
   5. Session / admin auth check
   6. Load clients + announcement history
   7. Client checklist renderer
   8. Recipient-type toggle
   9. Email-type selector
   10. Quill editor init + image upload handler
   11. Send Announcement / Update / Today Trade action
   12. Announcement history table renderer
   13. Login / logout event handlers
   14. Auth state listener & app start
========================================================= */


/* =========================================================
   1. SUPABASE CLIENT SETUP
========================================================= */

const SUPABASE_URL =
'https://nzasmkplxzirnqeteclv.supabase.co';

const SUPABASE_KEY =
'sb_publishable_ywmF35YANKsFEdZOs8wDdQ__jIezHTF';

const client =
supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);


/* =========================================================
   2. HELPERS
========================================================= */

const $ =
id => document.getElementById(id);


const esc =
s =>
String(s ?? '').replace(
  /[&<>'"]/g,
  c =>
  ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    "'":'&#39;',
    '"':'&quot;'
  }[c])
);


/* ADMIN UID — SAME AS MAIN DASHBOARD */

const ADMIN_UID =
'f40ac741-d4a0-4320-86ab-f5bedc3d091a';


let ALL_CLIENT_PROFILES = [];


/* =========================================================
   3. UI MESSAGES
========================================================= */

function showMsg(text,error=false){

  const el = $('msg');

  el.textContent = text;

  el.style.display = 'block';

  el.style.borderColor =
    error
    ? '#71343c'
    : '#20324a';

  el.style.color =
    error
    ? '#ffb6b6'
    : '#cfe0f5';

  setTimeout(
    () => el.style.display='none',
    5000
  );
}


function loginMsg(text,error=false){

  const el = $('loginMsg');

  el.textContent = text;

  el.style.display = 'block';

  el.style.color =
    error
    ? '#ffb6b6'
    : '#cfe0f5';
}


/* =========================================================
   4. PASSWORD SHOW/HIDE TOGGLE
========================================================= */

function togglePw(id,btn){

  const input = $(id);

  if(!input)return;

  const isHidden =
    input.type === 'password';

  input.type =
    isHidden
    ? 'text'
    : 'password';

  btn.textContent =
    isHidden
    ? '🙈'
    : '👁';

  btn.setAttribute(
    'aria-label',
    isHidden
    ? 'Hide password'
    : 'Show password'
  );
}


/* =========================================================
   5. SESSION / ADMIN AUTH CHECK
========================================================= */

async function getSession(){

  const {
    data
  } =
  await client.auth.getSession();

  return data.session;
}


async function checkAdmin(){

  const session =
    await getSession();

  if(!session){

    $('loginView').classList.remove('hidden');
    $('app').classList.add('hidden');

    return false;
  }


  if(session.user.id !== ADMIN_UID){

    await client.auth.signOut();

    $('loginView').classList.remove('hidden');
    $('app').classList.add('hidden');

    loginMsg(
      'This account is not an admin account.',
      true
    );

    return false;
  }


  const {
    data,
    error
  } =
  await client
    .from('profiles')
    .select('role')
    .eq('id',session.user.id)
    .maybeSingle();


  if(error){

    loginMsg(error.message, true);

    return false;
  }


  if(!data || data.role !== 'admin'){

    await client.auth.signOut();

    $('loginView').classList.remove('hidden');
    $('app').classList.add('hidden');

    loginMsg(
      'This account is not an admin account.',
      true
    );

    return false;
  }


  $('loginView').classList.add('hidden');
  $('app').classList.remove('hidden');

  $('adminEmail').textContent =
    session.user.email || '';

  return true;
}


/* =========================================================
   6. LOAD CLIENTS + ANNOUNCEMENT HISTORY
========================================================= */

async function loadAll(){

  try{

    if(!(await checkAdmin()))
      return;


    const [
      profiles,
      announcements
    ] =
    await Promise.all([

      client
        .from('profiles')
        .select('id,full_name,role')
        .eq('role','client')
        .order('created_at',{ascending:false}),

      client
        .from('announcements')
        .select('*')
        .order('created_at',{ascending:false})
        .limit(30)

    ]);


    if(profiles.error){

      showMsg(
        profiles.error.message,
        true
      );

      return;
    }


    if(announcements.error){

      showMsg(
        announcements.error.message,
        true
      );

      return;
    }


    ALL_CLIENT_PROFILES =
      profiles.data || [];


    renderClientChecklist(
      ALL_CLIENT_PROFILES
    );


    renderAnnouncementHistory(
      announcements.data || []
    );


  }catch(err){

    console.error(
      'loadAll unexpected error:',
      err
    );

    showMsg(
      'Something went wrong while loading data: ' +
      (
        err && err.message
        ? err.message
        : String(err)
      ),
      true
    );

  }
}


/* =========================================================
   7. CLIENT CHECKLIST RENDERER
========================================================= */

function renderClientChecklist(clientProfiles){

  if(!clientProfiles.length){

    $('annClientListWrap').innerHTML =
      '<div class="empty">No clients yet.</div>';

    return;
  }

  $('annClientListWrap').innerHTML =
    clientProfiles.map(p => `
      <label class="ann-client-item">

        <input
          type="checkbox"
          class="annClientCheckbox"
          value="${esc(p.id)}"
        >

        ${esc(p.full_name || 'Unknown')}

        <small>
          ${esc(p.id)}
        </small>

      </label>
    `).join('');
}


/* =========================================================
   8. RECIPIENT-TYPE TOGGLE
========================================================= */

document
  .querySelectorAll(
    'input[name="annRecipientType"]'
  )
  .forEach(radio => {

    radio.addEventListener(
      'change',
      () => {

        $('annClientListWrap').classList.toggle(
          'hidden',
          $('annRecipientAll').checked
        );

      }
    );

  });


/* =========================================================
   9. EMAIL-TYPE SELECTOR
========================================================= */

function getEmailType(){

  const selected =
    document.querySelector(
      'input[name="annEmailType"]:checked'
    );

  return selected
    ? selected.value
    : 'announcement';
}


function getEmailTypeLabel(emailType){

  if(emailType === 'update')
    return 'Account Update';

  if(emailType === 'today-trade')
    return 'Today Trade';

  return 'Announcement';
}


/* =========================================================
   EMAIL TYPE RADIO HANDLER

   Announcement:
   📢 Announcement

   Account Update:
   ⚙️ Account Update

   Today Trade:
   📈 Today Trade

   IMPORTANT:
   Today Trade does NOT redirect anywhere.
   It remains on this page and uses the same
   email sending flow.
========================================================= */

document
  .querySelectorAll(
    'input[name="annEmailType"]'
  )
  .forEach(radio => {

    radio.addEventListener(
      'change',
      () => {

        const type =
          getEmailType();


        const btn =
          $('sendAnnouncementBtn');


        if(!btn)
          return;


        if(type === 'update'){

          btn.textContent =
            'Send Account Update';

        }else if(type === 'today-trade'){

          btn.textContent =
            'Send Trade Code';

        }else{

          btn.textContent =
            'Send Announcement';

        }

      }
    );

  });


/* =========================================================
   10. QUILL EDITOR INIT + IMAGE UPLOAD HANDLER
========================================================= */

const annQuill = new Quill(
  '#annEditor',
  {
    theme: 'snow',

    placeholder:
      'Write your announcement...',

    modules: {

      toolbar: {

        container: [
          [{ header: [1, 2, false] }],
          ['bold', 'italic', 'underline', 'link'],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['image'],
          ['clean']
        ],

        handlers: {
          image: annImageHandler
        }

      }

    }

  }
);


async function annImageHandler(){

  const input =
    document.createElement('input');

  input.setAttribute(
    'type',
    'file'
  );

  input.setAttribute(
    'accept',
    'image/*'
  );

  input.click();


  input.onchange = async () => {

    const file =
      input.files[0];

    if(!file)
      return;


    const ext =
      file.name.split('.').pop();


    const path =
      `announcements/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;


    const { error: upErr } =
      await client.storage
        .from('announcement-images')
        .upload(path, file);


    if(upErr){

      showMsg(
        'Image upload failed: ' +
        upErr.message,
        true
      );

      return;
    }


    const { data: pub } =
      client.storage
        .from('announcement-images')
        .getPublicUrl(path);


    const range =
      annQuill.getSelection(true);


    annQuill.insertEmbed(
      range ? range.index : 0,
      'image',
      pub.publicUrl
    );

  };

}


/* =========================================================
   11. SEND ANNOUNCEMENT / UPDATE / TODAY TRADE ACTION
========================================================= */

$('sendAnnouncementBtn')
  .addEventListener(
    'click',
    async () => {

      const subject =
        $('annSubject')
          .value
          .trim();


      const message =
        annQuill.root.innerHTML.trim();


      const emailType =
        getEmailType();


      const emailTypeLabel =
        getEmailTypeLabel(
          emailType
        );


      const recipientType =
        $('annRecipientAll').checked
        ? 'all'
        : 'selected';


      let recipientIds = [];


      if(recipientType === 'selected'){

        recipientIds =
          Array.from(
            document.querySelectorAll(
              '.annClientCheckbox:checked'
            )
          ).map(
            cb => cb.value
          );

      }


      if(!subject){

        showMsg(
          'Enter a subject.',
          true
        );

        return;
      }


      if(
        !message ||
        message === '<p><br></p>'
      ){

        showMsg(
          'Enter a message.',
          true
        );

        return;
      }


      if(
        recipientType === 'selected' &&
        recipientIds.length === 0
      ){

        showMsg(
          'Select at least one client.',
          true
        );

        return;
      }


      const countLabel =
        recipientType === 'all'
        ? `all ${ALL_CLIENT_PROFILES.length} clients`
        : `${recipientIds.length} selected client(s)`;


      if(
        !confirm(
          `Send this ${emailTypeLabel.toLowerCase()} to ${countLabel}?`
        )
      )
        return;


      const btn =
        $('sendAnnouncementBtn');


      btn.disabled = true;

      btn.textContent =
        'Sending...';


      $('annResult')
        .textContent = '';


      try{

        const {
          data,
          error
        } =
        await client.functions.invoke(
          'send-announcement',
          {
            body: {
              subject,
              message,
              emailType,
              recipientType,
              recipientIds
            }
          }
        );


        if(error){

          showMsg(
            error.message ||
            'Failed to send email.',
            true
          );

          return;
        }


        if(data && data.error){

          showMsg(
            data.error,
            true
          );

          return;
        }


        $('annResult').innerHTML =
          `✅ ${data.sent} sent, ❌ ${data.failed} failed (of ${data.total})`;


        showMsg(
          `${emailTypeLabel} sent.`
        );


        $('annSubject').value =
          '';


        annQuill.setContents([]);


        loadAll();


      }catch(err){

        console.error(
          'Send announcement error:',
          err
        );


        showMsg(
          'Something went wrong sending the email: ' +
          (
            err && err.message
            ? err.message
            : String(err)
          ),
          true
        );


      }finally{

        btn.disabled = false;


        const currentType =
          getEmailType();


        if(currentType === 'update'){

          btn.textContent =
            'Send Account Update';

        }else if(currentType === 'today-trade'){

          btn.textContent =
            'Send Trade Code';

        }else{

          btn.textContent =
            'Send Announcement';

        }

      }

    }
  );


/* =========================================================
   12. ANNOUNCEMENT HISTORY TABLE RENDERER
========================================================= */

function renderAnnouncementHistory(rows){

  if(!rows.length){

    $('announcementHistoryTable').innerHTML =
      '<div class="empty">No announcements sent yet.</div>';

    return;
  }


  $('announcementHistoryTable').innerHTML = `

  <table>

    <thead>

      <tr>

        <th>Date</th>

        <th>Type</th>

        <th>Subject</th>

        <th>Recipients</th>

        <th>Sent</th>

        <th>Failed</th>

      </tr>

    </thead>


    <tbody>

      ${rows.map(r => `

        <tr>

          <td>
            ${new Date(r.created_at).toLocaleString()}
          </td>


          <td>

            ${
              r.email_type === 'update'
              ? '⚙️ Account Update'
              : r.email_type === 'today-trade'
              ? '📈 Today Trade'
              : '📢 Announcement'
            }

          </td>


          <td>
            ${esc(r.subject)}
          </td>


          <td>

            ${
              r.recipient_type === 'all'
              ? 'All Clients'
              : (r.total_recipients + ' selected')
            }

          </td>


          <td>
            ${r.sent_count}
          </td>


          <td>
            ${r.failed_count}
          </td>

        </tr>

      `).join('')}

    </tbody>

  </table>

  `;
}


/* =========================================================
   13. LOGIN / LOGOUT EVENT HANDLERS
========================================================= */

$('loginBtn')
  .addEventListener(
    'click',
    async()=>{

      const email =
        $('email').value.trim();

      const password =
        $('password').value;


      if(!email || !password){

        loginMsg(
          'Enter email and password.',
          true
        );

        return;
      }


      $('loginBtn').disabled = true;


      try{

        const { error } =
          await client.auth.signInWithPassword({
            email,
            password
          });


        if(error){

          loginMsg(
            error.message,
            true
          );

          return;
        }


        loginMsg(
          'Login successful.'
        );


        await loadAll();


      }catch(err){

        console.error(
          'Login error:',
          err
        );


        loginMsg(
          'Something went wrong logging in: ' +
          (
            err && err.message
            ? err.message
            : String(err)
          ),
          true
        );


      }finally{

        $('loginBtn').disabled = false;

      }

    }
  );


$('password')
  .addEventListener(
    'keydown',
    e => {

      if(e.key === 'Enter')
        $('loginBtn').click();

    }
  );


$('logoutBtn')
  .addEventListener(
    'click',
    async()=>{

      await client.auth.signOut();

      location.reload();

    }
  );


/* =========================================================
   14. AUTH STATE LISTENER & APP START
========================================================= */

client.auth.onAuthStateChange(
  (_event)=>{
    setTimeout(
      loadAll,
      0
    );
  }
);


loadAll();
