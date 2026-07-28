/* CFE Sprint — auth gate + gated content loader + admin approvals.
   Content lives in Supabase (cfe_content) and is served only to approved users. */
(function(){
  "use strict";
  var CFG = window.CFE_CONFIG || {};
  var sb=null, profile=null;

  var css=document.createElement('style');
  css.textContent=[
    '#cfe-gate{position:fixed;inset:0;z-index:10000;background:#0f1b2d;color:#e9edf4;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:24px}',
    '#cfe-gate .box{width:100%;max-width:420px;background:#16233a;border:1px solid #2a3a55;border-radius:16px;padding:30px}',
    '#cfe-gate h1{font-family:Georgia,serif;font-size:24px;margin:0 0 8px;color:#fff}',
    '#cfe-gate p{color:#9fb0c8;font-size:14px;line-height:1.55;margin:0 0 18px}',
    '#cfe-gate input{width:100%;padding:13px 14px;border-radius:10px;border:1px solid #33507d;background:#0f1b2d;color:#fff;font-size:16px;margin-bottom:12px;box-sizing:border-box}',
    '#cfe-gate button{width:100%;padding:13px;border-radius:10px;border:0;background:#e0b64a;color:#12233a;font-weight:700;font-size:15px;cursor:pointer}',
    '#cfe-gate button.ghost{background:transparent;color:#9fb0c8;border:1px solid #33507d;margin-top:10px;font-weight:500}',
    '#cfe-gate .msg{font-size:13px;margin-top:12px;min-height:18px;color:#f0c56a}',
    '#cfe-gate .brand{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#e0b64a;font-weight:700;margin-bottom:14px}',
    '#cfe-wm{position:fixed;inset:0;z-index:9990;pointer-events:none;opacity:.05;background-repeat:repeat}',
    '#cfe-admin-btn{position:fixed;right:14px;bottom:14px;z-index:9995;background:#0f1b2d;color:#e0b64a;border:1px solid #e0b64a;border-radius:22px;padding:9px 15px;font-size:13px;font-weight:600;cursor:pointer;font-family:system-ui,sans-serif}',
    'body.cfe-lock, body.cfe-lock *{ -webkit-user-select:none;-moz-user-select:none;user-select:none }',
    'body.cfe-lock input, body.cfe-lock textarea{ -webkit-user-select:text;user-select:text }'
  ].join('\n');
  document.head.appendChild(css);

  function gate(html){
    var g=document.getElementById('cfe-gate');
    if(!g){ g=document.createElement('div'); g.id='cfe-gate'; document.body.appendChild(g); }
    g.style.display='flex'; g.innerHTML='<div class="box">'+html+'</div>';
    return g;
  }
  function hideGate(){ var g=document.getElementById('cfe-gate'); if(g) g.style.display='none'; }
  function $(id){ return document.getElementById(id); }
  function esc(s){ return String(s||'').replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }

  function client(){
    if(sb) return sb;
    if(!(window.supabase && CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY)) return null;
    sb=window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY,
      { auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:true, storageKey:'cfe-auth' } });
    return sb;
  }

  async function start(){
    if(!client()){ gate('<h1>Setup needed</h1><p>Authentication is not configured for this site.</p>'); return; }
    var res=await sb.auth.getSession();
    if(res.data && res.data.session){ await afterLogin(); } else { loginEmail(); }
  }

  function loginEmail(){
    gate('<div class="brand">CFE Sprint</div><h1>Sign in</h1><p>Enter your email and we’ll send you a 6-digit sign-in code.</p>'+
      '<input id="cfe-email" type="email" placeholder="you@example.com" autocomplete="email">'+
      '<button id="cfe-send">Send code</button><div class="msg" id="cfe-msg"></div>');
    $('cfe-send').onclick=async function(){
      var email=($('cfe-email').value||'').trim().toLowerCase();
      if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ $('cfe-msg').textContent='Please enter a valid email.'; return; }
      $('cfe-send').disabled=true; $('cfe-msg').textContent='Sending code…';
      var r=await sb.auth.signInWithOtp({ email:email, options:{ shouldCreateUser:true, emailRedirectTo:window.location.href.split('#')[0] } });
      if(r.error){ $('cfe-msg').textContent=r.error.message; $('cfe-send').disabled=false; return; }
      loginCode(email);
    };
    $('cfe-email').addEventListener('keydown',function(e){ if(e.key==='Enter') $('cfe-send').click(); });
  }

  function loginCode(email){
    gate('<div class="brand">CFE Sprint</div><h1>Check your email</h1><p>We sent a 6-digit code to <b>'+esc(email)+'</b>. Enter it below. (If it’s not in your inbox, check spam.)</p>'+
      '<input id="cfe-code" inputmode="numeric" maxlength="6" placeholder="6-digit code">'+
      '<button id="cfe-verify">Verify &amp; sign in</button>'+
      '<button class="ghost" id="cfe-back">Use a different email</button><div class="msg" id="cfe-msg"></div>');
    $('cfe-verify').onclick=async function(){
      var token=($('cfe-code').value||'').trim();
      if(!/^\d{6}$/.test(token)){ $('cfe-msg').textContent='Enter the 6-digit code.'; return; }
      $('cfe-verify').disabled=true; $('cfe-msg').textContent='Verifying…';
      var r=await sb.auth.verifyOtp({ email:email, token:token, type:'email' });
      if(r.error){ $('cfe-msg').textContent=r.error.message; $('cfe-verify').disabled=false; return; }
      await afterLogin();
    };
    $('cfe-back').onclick=loginEmail;
    $('cfe-code').addEventListener('keydown',function(e){ if(e.key==='Enter') $('cfe-verify').click(); });
  }

  async function afterLogin(){
    gate('<h1>Loading…</h1><p>Setting up your account.</p>');
    var r=await sb.rpc('cfe_ensure_profile');
    if(r.error){ gate('<h1>Something went wrong</h1><p>'+esc(r.error.message)+'</p><button onclick="location.reload()">Retry</button>'); return; }
    profile=Array.isArray(r.data)?r.data[0]:r.data;
    if(profile && (profile.approved || profile.is_admin)){ await bootApp(); }
    else { awaiting(); }
  }

  function awaiting(){
    gate('<div class="brand">CFE Sprint</div><h1>Awaiting approval</h1><p>Thanks for signing up. Your account (<b>'+esc(profile.email)+'</b>) is pending approval by the administrator. You’ll get access as soon as it’s approved — no need to sign up again.</p>'+
      '<button id="cfe-refresh">I’ve been approved — check again</button>'+
      '<button class="ghost" id="cfe-signout">Sign out</button>');
    $('cfe-refresh').onclick=afterLogin;
    $('cfe-signout').onclick=async function(){ await sb.auth.signOut(); location.reload(); };
  }

  async function bootApp(){
    var r=await sb.from('cfe_content').select('value').eq('key','app').single();
    if(r.error || !r.data){ gate('<h1>Could not load content</h1><p>'+esc(r.error?r.error.message:'No content found')+'</p><button onclick="location.reload()">Retry</button>'); return; }
    window.__CFE_DATA=r.data.value;
    hideGate();
    protect(profile.email);
    if(profile.is_admin) adminButton();
    var s=document.createElement('script'); s.src='app.js'; document.body.appendChild(s);
  }

  function protect(email){
    document.body.classList.add('cfe-lock');
    ['contextmenu','copy','cut','dragstart'].forEach(function(ev){
      document.addEventListener(ev,function(e){
        var t=e.target; if(t && (t.tagName==='INPUT'||t.tagName==='TEXTAREA')) return;
        e.preventDefault();
      });
    });
    var svg='<svg xmlns="http://www.w3.org/2000/svg" width="360" height="200">'+
      '<text x="30" y="110" font-family="monospace" font-size="13" fill="#ffffff" transform="rotate(-22 180 100)">'+esc(email)+' · CFE Sprint</text></svg>';
    var wm=document.createElement('div'); wm.id='cfe-wm';
    wm.style.backgroundImage='url("data:image/svg+xml;utf8,'+encodeURIComponent(svg).replace(/'/g,'%27')+'")';
    document.body.appendChild(wm);
  }

  function adminButton(){
    var b=document.createElement('button'); b.id='cfe-admin-btn'; b.textContent='⚙ Admin';
    b.onclick=openAdmin; document.body.appendChild(b);
  }
  async function openAdmin(){
    gate('<h1>Loading users…</h1>');
    var r=await sb.rpc('cfe_list_users');
    if(r.error){ gate('<h1>Error</h1><p>'+esc(r.error.message)+'</p><button class="ghost" id="cfe-admin-close">Back</button>'); $('cfe-admin-close').onclick=hideGate; return; }
    var users=r.data||[];
    var pending=users.filter(function(u){return !u.approved && !u.is_admin;}).length;
    var rows=users.map(function(u){
      var st=(u.is_admin?'admin · ':'')+(u.approved?'approved':'pending');
      var btn=u.is_admin?'':'<button data-id="'+u.id+'" data-ok="'+(u.approved?'0':'1')+'" class="cfe-appr" style="width:auto;padding:7px 13px;font-size:12px;background:'+(u.approved?'#33507d':'#e0b64a')+';color:'+(u.approved?'#e9edf4':'#12233a')+'">'+(u.approved?'Revoke':'Approve')+'</button>';
      return '<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #2a3a55">'+
        '<div style="flex:1;min-width:0"><div style="font-size:14px;color:#e9edf4;overflow:hidden;text-overflow:ellipsis">'+esc(u.email||'(no email)')+'</div>'+
        '<div style="font-size:11px;color:#9fb0c8">'+st+'</div></div>'+btn+'</div>';
    }).join('');
    gate('<div class="brand">Admin</div><h1>User approvals</h1><p>'+users.length+' user(s) · '+pending+' pending. Approve to grant content access.</p>'+
      '<div style="max-height:52vh;overflow:auto;margin-bottom:14px">'+(rows||'<p>No users yet.</p>')+'</div>'+
      '<button class="ghost" id="cfe-admin-close">← Back to app</button>');
    var els=document.querySelectorAll('.cfe-appr');
    for(var i=0;i<els.length;i++){ els[i].onclick=async function(e){
      var el=e.currentTarget; el.disabled=true; el.textContent='…';
      var rr=await sb.rpc('cfe_set_approval',{ target:el.dataset.id, ok:el.dataset.ok==='1' });
      if(rr.error){ el.textContent='Error'; return; }
      openAdmin();
    }; }
    $('cfe-admin-close').onclick=hideGate;
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start); else start();
})();
