/* Newsletter signup: posts to the shared Basin form (form_type=newsletter). Status messages come from the i18n dictionary (signup_sending / signup_ok / signup_fail). */
(function(){
  var forms=document.querySelectorAll('form.signup-form');
  if(!window.fetch||!window.FormData)return;
  function tr(k,fb){var I=window.SpotAndTravelI18n;var v=I&&I.t?I.t(k):k;return(!v||v===k)?fb:v;}
  function esc(x){return String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  function failHtml(){return esc(tr('signup_fail','Sorry, that didn’t go through. Please email hello@spotandtravel.com.')).replace('hello@spotandtravel.com','<a href="mailto:hello@spotandtravel.com">hello@spotandtravel.com</a>');}
  Array.prototype.forEach.call(forms,function(f){
    var st=f.querySelector('.signup-status'),b=f.querySelector('button[type=submit]');
    f.addEventListener('submit',function(e){
      if(!f.checkValidity())return;e.preventDefault();b.disabled=true;st.hidden=false;st.textContent=tr('signup_sending','Signing you up…');
      fetch(f.action,{method:'POST',headers:{Accept:'application/json'},body:new FormData(f),credentials:'omit'})
      .then(function(r){return r.json().catch(function(){return{}}).then(function(j){
        if(r.ok&&(j.success===true||/^(ok|success)$/i.test(String(j.status||'')))){f.reset();st.textContent=tr('signup_ok','You’re in! Your first hidden gem arrives next week.');}
        else st.innerHTML=failHtml();})})
      .catch(function(){st.innerHTML=failHtml();}).then(function(){b.disabled=false;});
    });
  });
})();
