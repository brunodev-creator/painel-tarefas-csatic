/* SIG CSA-TIC — login institucional, somente apresentação.
 * Reaproveita os formulários e handlers Supabase originais de app.js.
 * Nunca guarda senha, token ou dados financeiros.
 */
(function () {
 'use strict';
 var SAVE_EMAIL_KEY = 'sig-csatic-login-email';
 var imageCrest = './assets/escudo-csa-tic-original.svg?v=20261017-escudo-transparente-1';
 var body = document.body;
 var content = document.getElementById('content');
 if (!content) return;
 var applying = false;

 function fitToViewport() {
  var card = content.querySelector('.sig-auth-card');
  var panel = content.querySelector('.sig-auth-blue');
  if (!card || !panel || !document.body.classList.contains('sig-auth-mode')) return;
  // scrollHeight é independente de transform: calcula a altura real do formulário.
  var viewport = window.visualViewport;
  var height = viewport && viewport.height ? viewport.height : window.innerHeight;
  var availableHeight = Math.max(100, height - 20);
  var availableWidth = Math.max(180, panel.clientWidth - 22);
  var intrinsicHeight = Math.max(1, card.scrollHeight);
  var intrinsicWidth = Math.max(1, card.offsetWidth);
  var scale = Math.min(1, availableHeight / intrinsicHeight, availableWidth / intrinsicWidth);
  card.style.setProperty('--sig-auth-scale', String(Math.max(0.3, scale)));
 }
 function scheduleFit() {
  if (typeof window.requestAnimationFrame === 'function') {
   window.requestAnimationFrame(fitToViewport);
  } else { fitToViewport(); }
 }
 window.addEventListener('resize', scheduleFit, {passive:true});
 if (window.visualViewport) window.visualViewport.addEventListener('resize', scheduleFit, {passive:true});

 function escapeText(value) {
  return String(value || '').replace(/[&<>"']/g, function (c) {
   return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
 }
 function icon(name) {
  if (name === 'user') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M19 21H5v-2a7 7 0 0 1 14 0z"/><circle cx="12" cy="7" r="4"/></svg>';
  if (name === 'lock') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="M12 15v3"/></svg>';
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M2 12c2.5-4 5.9-6 10-6s7.5 2 10 6c-2.5 4-5.9 6-10 6S4.5 16 2 12Z"/><circle cx="12" cy="12" r="2.8"/></svg>';
 }
 function savedEmail() { try { return localStorage.getItem(SAVE_EMAIL_KEY) || ''; } catch (_) { return ''; } }
 function makeFormStyles(form) {
  form.classList.add('sig-auth-form');
  var rows = form.querySelectorAll('.form-row');
  Array.from(rows).forEach(function(row) {
   var field = row.querySelector('input');
   if (!field) return;
   var isPass = field.type === 'password';
   var isEmail = field.type === 'email';
   row.classList.add('sig-auth-field', isPass ? 'sig-auth-field-pass' : isEmail ? 'sig-auth-field-email' : '');
   row.insertAdjacentHTML('afterbegin','<span class="sig-auth-field-icon">'+icon(isPass?'lock':'user')+'</span>');
   if(isEmail && field.name === 'email') {
    field.setAttribute('placeholder', 'Usuário');
    field.setAttribute('autocomplete', 'username');
    if(!field.value) field.value = savedEmail();
   } else if(isPass) {
    field.setAttribute('placeholder', field.name === 'confirm'?'Confirmar senha':field.closest('[data-form="activateAccount"]')?'Nova senha':'Senha');
    row.insertAdjacentHTML('beforeend','<button type="button" class="sig-auth-eye" data-sig-login-toggle="password" aria-label="Mostrar senha" aria-pressed="false">'+icon('eye')+'</button>');
   }
  });
  var footer = form.querySelector('.modal-footer');
  if (footer) {
   footer.classList.add('sig-auth-submit-wrap');
   var btn = footer.querySelector('button[type="submit"]');
   if (btn) {
    btn.classList.add('sig-auth-submit');
    btn.innerHTML = (form.dataset.form === 'activateAccount' ? 'Ativar acesso' : 'Entrar') + ' <span class="sig-auth-arrow" aria-hidden="true">→</span>';
   }
  }
  if (form.dataset.form === 'login') {
   var footerLogin = form.querySelector('.sig-auth-submit-wrap');
   var row = document.createElement('div');
   row.className = 'sig-auth-options';
   row.innerHTML = '<label class="sig-auth-remember"><input type="checkbox" name="sig_remember_email" checked> <span>Lembrar-me</span></label>'+
    '<button class="sig-auth-forgot" type="button" data-sig-login-action="recover" aria-expanded="false">Esqueci minha senha?</button>';
   if(footerLogin) form.insertBefore(row,footerLogin);
   form.addEventListener('submit',function () {
    var email = form.querySelector('input[name="email"]');
    var remember = form.querySelector('input[name="sig_remember_email"]');
    if(!email) return;
    try { if(remember && remember.checked) localStorage.setItem(SAVE_EMAIL_KEY,email.value.trim()); else localStorage.removeItem(SAVE_EMAIL_KEY); } catch (_) {}
   });
  }
 }
 function layout(activation) {
  return '<section class="sig-auth-shell" aria-label="Acesso ao SIG CSA-TIC">'+
   '<div class="sig-auth-landscape" aria-hidden="true"><div class="sig-auth-topography"></div></div>'+
   '<div class="sig-auth-blue"><div class="sig-auth-mark" aria-hidden="true"></div>'+
    '<div class="sig-auth-card">'+
     '<img class="sig-auth-crest" src="'+imageCrest+'" alt="Escudo do CSA-TIC da Polícia Militar de Minas Gerais" width="152" height="168">'+
     '<h1 class="sig-auth-title">PMMG – CSA-TIC</h1>'+
     '<p class="sig-auth-eyebrow">'+(activation?'PRIMEIRO ACESSO':'ACESSO AO SISTEMA')+'</p>'+
     '<div class="sig-auth-gold-rule" aria-hidden="true"></div>'+
     '<div class="sig-auth-form-slot"></div>'+
     '<div class="sig-auth-recovery" hidden></div>'+
     '<div class="sig-auth-foot"><svg viewBox="0 0 115 35" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 32 29-22 18 15 18-21 43 28m-69-8 9-7 8 7"/></svg>'+
      '<span>TECNOLOGIA A SERVIÇO DE MINAS GERAIS</span></div>'+
     '<button type="button" class="sig-auth-settings" data-action="settings">Configurações de conexão</button>'+
    '</div>'+
   '</div></section>';
 }
 function mount() {
  if (applying) return;
  var existed = content.querySelector('.sig-auth-shell');
  if (existed) return;
  var loginForm = content.querySelector('form[data-form="login"]');
  var activateForm = content.querySelector('form[data-form="activateAccount"]');
  if (!loginForm && !activateForm) {
   body.classList.remove('sig-auth-mode');
   return;
  }
  applying = true;
  try {
   var form = loginForm || activateForm;
   var recoveryForm = content.querySelector('form[data-form="recover"]');
   var activation = !!activateForm;
   body.classList.add('sig-auth-mode');
   makeFormStyles(form);
   if(recoveryForm) {
    recoveryForm.classList.add('sig-auth-recovery-form');
    var recoverEmail = recoveryForm.querySelector('input[name="email"]');
    if(recoverEmail) recoverEmail.setAttribute('placeholder','E-mail da sua conta');
   }
   content.innerHTML = layout(activation);
   content.querySelector('.sig-auth-form-slot').appendChild(form);
   if(recoveryForm) {
    var panel = content.querySelector('.sig-auth-recovery');
    panel.innerHTML = '<h2>Recuperar acesso</h2><p>Solicite o link de redefinição para o e-mail da sua conta.</p>';
    panel.appendChild(recoveryForm);
   }
   scheduleFit();
  } finally { applying = false; }
 }
 content.addEventListener('click',function(event) {
  var eye = event.target.closest('[data-sig-login-toggle="password"]');
  if(eye) {
   var input = eye.parentElement.querySelector('input');
   if(input) {
    input.type = input.type === 'password'?'text':'password';
    var visible = input.type === 'text';
    eye.setAttribute('aria-pressed',visible?'true':'false');
    eye.setAttribute('aria-label',visible?'Ocultar senha':'Mostrar senha');
   }
   return;
  }
  var toggle = event.target.closest('[data-sig-login-action="recover"]');
  if(toggle) {
   var panel = content.querySelector('.sig-auth-recovery');
   if(panel) { panel.hidden=!panel.hidden; toggle.setAttribute('aria-expanded',String(!panel.hidden)); if(!panel.hidden) panel.querySelector('input')?.focus(); scheduleFit(); }
  }
 });
 var observer = new MutationObserver(mount);
 observer.observe(content,{childList:true,subtree:false});
 mount();
})();
