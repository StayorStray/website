/* Newsletter signup: posts to the shared Basin form (form_type=newsletter). English-only until the Nov 1 translation pass. */
(function(){
  var forms=document.querySelectorAll('form.signup-form');
  if(!window.fetch||!window.FormData)return;
  Array.prototype.forEach.call(forms,function(f){
    var st=f.querySelector('.signup-status'),b=f.querySelector('button[type=submit]');
    var fail='Sorry, that didn’t go through. Please email <a href="mailto:hello@spotandtravel.com">hello@spotandtravel.com</a>.';
    f.addEventListener('submit',function(e){
      if(!f.checkValidity())return;e.preventDefault();b.disabled=true;st.hidden=false;st.textContent='Signing you up…';
      fetch(f.action,{method:'POST',headers:{Accept:'application/json'},body:new FormData(f),credentials:'omit'})
      .then(function(r){return r.json().catch(function(){return{}}).then(function(j){
        if(r.ok&&(j.success===true||/^(ok|success)$/i.test(String(j.status||'')))){f.reset();st.textContent='You’re in! Your first hidden gem arrives next week.';}
        else st.innerHTML=fail;})})
      .catch(function(){st.innerHTML=fail;}).then(function(){b.disabled=false;});
    });
  });
})();
