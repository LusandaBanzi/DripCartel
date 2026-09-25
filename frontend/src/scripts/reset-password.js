(function(){
"use strict";
const $=id=>document.getElementById(id);
const token=new URLSearchParams(location.hash.replace(/^#/, "")).get("token")||"";
try { if (token) history.replaceState(null, "", "reset-password.html"); } catch {}
function validPassword(p){return p.length>=10&&/[A-Z]/.test(p)&&/[a-z]/.test(p)&&/[0-9]/.test(p)&&/[^A-Za-z0-9]/.test(p);}
$("resetForm")?.addEventListener("submit",async e=>{
  e.preventDefault(); $("resetError").textContent="";
  const password=$("resetPassword").value,confirm=$("resetPasswordConfirm").value;
  if(!/^[a-f0-9]{64}$/.test(token)){ $("resetError").textContent="This password-reset link is invalid or has expired."; return; }
  if(!validPassword(password)){ $("resetError").textContent="Password must be at least 10 characters and include uppercase, lowercase, number and a special character."; return; }
  if(password!==confirm){ $("resetError").textContent="Passwords do not match."; return; }
  try {
    const response=await DripAPI.fetch("/api/auth/reset-password",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({token,password})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok){$("resetError").textContent=data.error||"Could not reset your password.";return;}
    $("resetForm").hidden=true; $("resetSuccess").hidden=false;
  } catch { $("resetError").textContent="We couldn't reach the password-reset service. Please try again."; }
});
})();
