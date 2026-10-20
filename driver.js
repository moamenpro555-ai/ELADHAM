var id=new URLSearchParams(location.search).get("id"),watch=null,tm=null,cur=null,lock=null,dest=null,rem="";
function $(i){return document.getElementById(i)}

if(!id){
  $("hi").textContent="رابط غير صحيح";$("go").disabled=true;
}else{
  $("hi").textContent="جاري التحميل... (لو السيرفر كان نايم ممكن ياخد لحد دقيقة)";
  fetch((window.API_BASE||"")+"/api/drivers/"+id+"/info").then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(d){
    $("hi").textContent="أهلًا "+d.name;
    dest=parseDest(d.destination);
    $("dest").textContent="الوجهة: "+(dest.label||"-")+(d.status=="arrived"?" (تم الوصول)":"");
    if(dest.lat!=null){
      var a=$("nav");a.hidden=false;
      a.href="https://www.google.com/maps/dir/?api=1&destination="+dest.lat+","+dest.lng+"&travelmode=driving";
    }
  }).catch(function(){
    $("hi").textContent="تعذر تحميل البيانات";
    $("err").textContent="الرابط غلط أو السيرفر مش بيرد. اقفل الصفحة وافتحها تاني بعد دقيقة.";
    $("go").disabled=true;
  });
}

function send(){
  if(!cur)return;
  var p=cur;
  fetch((window.API_BASE||"")+"/api/drivers/"+id+"/location",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({lat:p.coords.latitude,lng:p.coords.longitude})})
  .then(function(r){if(!r.ok)throw 0;
    $("info").textContent="آخر إرسال: "+new Date().toLocaleTimeString("ar-EG")+rem;
    $("err").textContent="";
  }).catch(function(){$("err").textContent="تعذر الإرسال، تأكد من الإنترنت (هنحاول تاني تلقائيًا)"});
}
function onPos(p){
  var first=!cur;cur=p;
  if(dest&&dest.lat!=null)rem=" · المتبقي حوالي "+km(p.coords.latitude,p.coords.longitude,dest.lat,dest.lng)+" كم (خط مستقيم)";
  if(first)send();
}
async function wl(){try{if(navigator.wakeLock)lock=await navigator.wakeLock.request("screen")}catch(e){}}
document.addEventListener("visibilitychange",function(){if(watch!==null&&document.visibilityState=="visible")wl()});

function toggle(){
  if(watch!==null){
    navigator.geolocation.clearWatch(watch);watch=null;clearInterval(tm);tm=null;cur=null;
    if(lock){lock.release();lock=null}
    $("dot").className="pulse off";$("st").textContent="المشاركة متوقفة";$("go").textContent="ابدأ مشاركة موقعي";return;
  }
  if(!navigator.geolocation){$("err").textContent="المتصفح لا يدعم تحديد الموقع";return}
  watch=navigator.geolocation.watchPosition(onPos,function(e){
    $("err").textContent=e.code==1?"لازم تسمح للمتصفح بتحديد الموقع من الإعدادات":"تعذر تحديد الموقع، تأكد إن الـ GPS شغال";
  },{enableHighAccuracy:true,maximumAge:10000,timeout:30000});
  // بنبعت آخر موقع كل دقيقة حتى لو العربية واقفة
  tm=setInterval(send,60000);
  wl();
  $("dot").className="pulse";$("st").textContent="الموقع بيتبعت للشركة";$("go").textContent="إيقاف المشاركة";
}
