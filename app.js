var BASE=location.origin+location.pathname.replace(/[^\/]*$/,""),D=[],KEY=sessionStorage.getItem("mwkey")||"";
var pick=null,RES=[],pmap=null,pm=null,map=null,layer=null,M={},fitted=false,loaded=false,timer=null,lastReg=null;
function $(i){return document.getElementById(i)}
function esc(s){var d=document.createElement("div");d.textContent=s==null?"":s;return d.innerHTML}
function dig(s){return String(s||"").replace(/[٠-٩]/g,function(c){return "٠١٢٣٤٥٦٧٨٩".indexOf(c)})}
function normPhone(s){s=dig(s).replace(/[^\d]/g,"");if(s.indexOf("20")==0&&s.length==12)s="0"+s.slice(2);return s}
function tiles(m){L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"&copy; OpenStreetMap"}).addTo(m)}
$("de").innerHTML='<option value="">أو اختر مدينة بسرعة</option>'+Object.keys(C).map(function(k){return"<option>"+k+"</option>"}).join("");

/* ---------- الاتصال بالسيرفر ---------- */
async function api(path,opt){
  opt=opt||{};
  opt.headers={"Content-Type":"application/json","x-admin-key":KEY};
  var ac=new AbortController(),to=setTimeout(function(){ac.abort()},75000);
  opt.signal=ac.signal;
  var r;
  try{r=await fetch((window.API_BASE||"")+"/api"+path,opt)}
  catch(e){clearTimeout(to);throw new Error(e.name=="AbortError"?"السيرفر مردش خلال 75 ثانية (غالبًا كان نايم). جرّب تاني.":"تعذر الاتصال بالسيرفر (غالبًا مشكلة CORS أو الرابط في config.js غلط أو السيرفر واقف)")}
  clearTimeout(to);
  if(r.status==401)throw new Error("auth");
  var j=await r.json().catch(function(){return{}});
  if(!r.ok)throw new Error(j.error||("خطأ من السيرفر ("+r.status+")"));
  return j;
}

/* ---------- التبويبات ---------- */
function tab(n){
  clearInterval(timer);
  if(n==2)timer=setInterval(load,30000);
  $("p1").hidden=n!=1;$("p2").hidden=n!=2;
  $("t1").className=n==1?"on":"";$("t2").className=n==2?"on":"";
  if(n==1&&pmap)setTimeout(function(){pmap.invalidateSize()},50);
  if(n==2){initMap();if(map)setTimeout(function(){map.invalidateSize()},50);load()}
}

/* ---------- اختيار الوجهة بالتفصيل ---------- */
function initPick(){
  if(pmap)return;
  if(!window.L){$("pmap").innerHTML='<p class="mut" style="padding:16px;direction:rtl">مكتبة الخريطة مش اتحمّلت. تأكد من الإنترنت.</p>';return}
  pmap=L.map("pmap",{scrollWheelZoom:false}).setView([27.5,31],6);
  tiles(pmap);
  pmap.on("click",function(e){$("de").value="";setPick(e.latlng.lat,e.latlng.lng,"موقع محدد على الخريطة",null,true)});
}
function showSel(){
  $("sel").innerHTML=pick?'✓ الوجهة: <b>'+esc(pick.label)+'</b> <span class="mut">('+pick.lat.toFixed(4)+', '+pick.lng.toFixed(4)+')</span>':'لسه مفيش وجهة متحددة.';
}
function setPick(lat,lng,label,city,rev){
  pick={lat:lat,lng:lng,label:label,city:city||null};
  if(pmap){
    if(!pm){
      pm=L.marker([lat,lng],{draggable:true,icon:L.divIcon({className:"pin",html:"📍",iconSize:[28,28],iconAnchor:[14,28]})}).addTo(pmap);
      pm.on("dragend",function(){var p=pm.getLatLng();$("de").value="";setPick(p.lat,p.lng,"موقع محدد على الخريطة",null,true)});
    }else pm.setLatLng([lat,lng]);
  }
  showSel();
  if(rev)reverse(lat,lng);
}
function reverse(lat,lng){
  fetch("https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=ar&zoom=18&lat="+lat+"&lon="+lng)
  .then(function(r){return r.json()})
  .then(function(j){if(pick&&pick.lat==lat&&pick.lng==lng&&j&&j.display_name){pick.label=j.display_name;showSel()}})
  .catch(function(){});
}
function search(){
  var q=$("q").value.trim();if(!q)return;
  $("res").innerHTML='<p class="mut">جاري البحث...</p>';
  fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&accept-language=ar&countrycodes=eg&limit=6&q="+encodeURIComponent(q))
  .then(function(r){if(!r.ok)throw 0;return r.json()})
  .then(function(j){
    RES=j;
    if(!j.length){$("res").innerHTML='<p class="mut">مفيش نتائج. جرّب اسم الشارع + المنطقة + المدينة، أو اضغط على الخريطة وحدد النقطة بنفسك.</p>';return}
    $("res").innerHTML=j.map(function(x,i){return'<button type="button" class="opt" onclick="selRes('+i+')">'+esc(x.display_name)+'</button>'}).join("");
  })
  .catch(function(){$("res").innerHTML='<p style="color:#c0392b;font-weight:700">تعذر البحث دلوقتي. اضغط على الخريطة وحدد النقطة بنفسك.</p>'});
}
function selRes(i){
  var x=RES[i];if(!x)return;
  $("de").value="";$("res").innerHTML="";
  setPick(+x.lat,+x.lon,x.display_name,null,false);
  if(pmap)pmap.setView([+x.lat,+x.lon],16);
}
function cityPick(){
  var v=$("de").value;if(!v||!C[v])return;
  setPick(C[v][0],C[v][1],v,v,false);
  if(pmap)pmap.setView(C[v],11);
}
$("q").addEventListener("keydown",function(e){if(e.key=="Enter"){e.preventDefault();search()}});

/* ---------- تسجيل سائق ---------- */
async function add(){
  var n=$("n").value.trim(),p=normPhone($("ph").value);
  if(!n){alert("اكتب اسم السائق");return}
  if(!/^01[0125]\d{8}$/.test(p)){alert("رقم الموبايل غير صحيح، لازم 11 رقم ويبدأ بـ 01");return}
  if(!pick){alert("حدد الوجهة: ابحث عن العنوان، أو اضغط على الخريطة، أو اختر مدينة");return}
  var ex=$("ex").value.trim();
  var dest=(pick.city&&!ex)?pick.city:encDest((ex?ex+" — ":"")+pick.label,pick.lat,pick.lng);
  var b=$("addb");b.disabled=true;
  try{
    var r=await api("/drivers",{method:"POST",body:JSON.stringify({name:n,phone:p,license_no:$("lic").value.trim(),plate:$("pl").value.trim(),vehicle_type:$("ty").value,destination:dest})});
    var link=BASE+"driver.html?id="+r.id;
    lastReg={p:p,link:link,n:n};
    ["n","ph","lic","pl","ex","q"].forEach(function(i){$(i).value=""});
    $("res").innerHTML="";$("de").value="";pick=null;showSel();
    if(pm&&pmap){pmap.removeLayer(pm);pm=null}
    $("msg").innerHTML='تم تسجيل السائق ✓ <button class="btn s" onclick="cp(lastReg.link)">نسخ الرابط</button> <button class="btn s g" onclick="wa(lastReg.p,lastReg.link,lastReg.n)">إرسال واتساب</button>';
  }catch(e){
    if(e.message=="auth"){alert("لازم تدخل كلمة سر الإدارة الأول من تبويب الأسطول والخريطة");tab(2)}
    else alert(e.message);
  }
  b.disabled=false;
}

/* ---------- الأسطول ---------- */
var _kq=null;
function setKey(){KEY=$("kin").value.trim();sessionStorage.setItem("mwkey",KEY);load()}
async function load(){
  if(!loaded)$("list").innerHTML='<p class="mut">جاري الاتصال بالسيرفر... لو كان نايم ممكن ياخد لحد دقيقة.</p>';
  try{D=await api("/fleet");loaded=true;draw()}
  catch(e){
    if(e.message=="auth")$("list").innerHTML='<p><b>أدخل كلمة سر الإدارة</b></p><p><input id="kin" type="password" style="max-width:260px"> <button class="btn" onclick="setKey()">دخول</button></p>';
    else $("list").innerHTML='<p style="color:#c0392b;font-weight:700">'+esc(e.message)+'</p><p><button class="btn" onclick="load()">إعادة المحاولة</button></p>';
  }
}
function find(id){return D.filter(function(x){return x.id==id})[0]}
async function del(id){
  if(!confirm("حذف السائق؟"))return;
  try{await api("/drivers/"+id,{method:"DELETE"});load()}catch(e){alert(e.message)}
}
function mins(t){return t?Math.round((Date.now()-new Date(t))/60000):null}
function ago(t){var m=mins(t);if(m==null)return"";return m<1?"الآن":m<60?"منذ "+m+" دقيقة":m<1440?"منذ "+Math.round(m/60)+" ساعة":"منذ "+Math.round(m/1440)+" يوم"}
function waLink(phone,link,name){
  var n=normPhone(phone);if(n.indexOf("0")==0)n="2"+n;
  return"https://wa.me/"+n+"?text="+encodeURIComponent("أهلًا "+name+"، ده رابط تتبع رحلتك مع شركة المتوكل للنقل. افتحه واضغط (ابدأ مشاركة موقعي) وسيب الصفحة مفتوحة أثناء الرحلة:\n"+link);
}
function wa(phone,link,name){window.open(waLink(phone,link,name),"_blank")}
function waD(id){var d=find(id);if(d)wa(d.phone,BASE+"driver.html?id="+d.id,d.name)}
function startKm(d,t,r){
  if(!t.exact)return d.start_km||r||1;
  var k="mwst:"+d.id,m=0;
  try{m=+localStorage.getItem(k)||0;if(r!=null&&r>m){m=r;localStorage.setItem(k,m)}}catch(e){m=r||0}
  return m||1;
}
function initMap(){
  if(map)return;
  if(!window.L){$("map").innerHTML='<p class="mut" style="padding:16px;direction:rtl">مكتبة الخريطة (Leaflet) مش اتحمّلت. تأكد من الإنترنت.</p>';return}
  map=L.map("map",{scrollWheelZoom:false}).setView([27.5,31],6);
  tiles(map);
  layer=L.layerGroup().addTo(map);
}
function focusD(id){
  var d=find(id);if(!d||d.lat==null||!map)return;
  map.setView([d.lat,d.lng],12);$("map").scrollIntoView({behavior:"smooth",block:"center"});
}
function draw(){
  var run=0,arr=0,h="",pts=[],seen={};
  initMap();
  if(map)map.invalidateSize();
  D.forEach(function(d){
    var t=parseDest(d.destination),has=d.lat!=null&&d.lng!=null,hasT=t.lat!=null;
    var r=(has&&hasT)?km(d.lat,d.lng,t.lat,t.lng):null;
    var st=startKm(d,t,r),th=t.exact?0.3:15;
    var done=d.status=="arrived"||(r!=null&&r<th);
    var pr=done?100:(r!=null&&st>0?Math.max(0,Math.min(100,Math.round((1-r/st)*100))):0);
    var old=has&&mins(d.recorded_at)>10;
    if(done)arr++;else run++;
    var info=done?"وصل":(r!=null?"المتبقي حوالي "+r+" كم (خط مستقيم)":"");
    if(map&&(has||hasT)){
      seen[d.id]=1;
      var o=M[d.id]||(M[d.id]={});
      if(hasT){
        pts.push([t.lat,t.lng]);
        if(!o.t)o.t=L.circleMarker([t.lat,t.lng],{radius:6,color:"#1b3a6b",fillColor:"#fff",fillOpacity:1,weight:3}).addTo(layer);
        else o.t.setLatLng([t.lat,t.lng]);
        o.t.unbindTooltip();o.t.bindTooltip(t.label);
      }
      if(has){
        pts.push([d.lat,d.lng]);
        var pop="<b>"+esc(d.name)+"</b><br>"+esc(d.plate||"")+"<br>الوجهة: "+esc(t.label)+"<br>"+info+"<br>آخر موقع: "+ago(d.recorded_at);
        var ic=L.divIcon({className:"trk"+(done?" done":"")+(old?" old":""),html:"🚚",iconSize:[36,36],iconAnchor:[18,18]});
        if(!o.m){o.m=L.marker([d.lat,d.lng],{icon:ic}).bindPopup(pop).addTo(layer)}
        else{o.m.setLatLng([d.lat,d.lng]);o.m.setIcon(ic);o.m.getPopup().setContent(pop)}
        if(hasT){
          if(!o.l)o.l=L.polyline([[d.lat,d.lng],[t.lat,t.lng]],{color:"#c9993a",weight:3,dashArray:"6 8"}).addTo(layer);
          else o.l.setLatLngs([[d.lat,d.lng],[t.lat,t.lng]]);
        }
      }
    }
    h+='<div class="row"><div><b>'+esc(d.name)+'</b> <span class="tag">'+esc(d.vehicle_type)+'</span>'+(done?' <span class="tag" style="background:#2a9d5c">وصل</span>':'')+(old?' <span class="tag" style="background:#c0392b">الموقع قديم</span>':'')
      +'<div class="mut">'+esc(d.phone)+' · لوحة: '+esc(d.plate||"-")+'</div>'
      +'<div class="mut">الوجهة: '+esc(t.label)+'</div>'
      +'<div class="mut">'+(has?info+' · آخر موقع '+ago(d.recorded_at):'لم يبدأ مشاركة الموقع بعد')+'</div>'
      +'<div class="bar"><i style="width:'+pr+'%"></i></div></div>'
      +'<div>'+(has?'<button class="btn s g" onclick="focusD(\''+d.id+'\')">على الخريطة</button> ':'')
      +'<button class="btn s" onclick="cp(BASE+\'driver.html?id='+d.id+'\')">رابط السائق</button> '
      +'<button class="btn s" style="background:#25a244" onclick="waD(\''+d.id+'\')">واتساب</button> '
      +'<button class="btn s" style="background:#a33" onclick="del(\''+d.id+'\')">حذف</button></div></div>';
  });
  if(layer)Object.keys(M).forEach(function(id){
    if(!seen[id]){var o=M[id];[o.m,o.t,o.l].forEach(function(x){if(x)layer.removeLayer(x)});delete M[id]}
  });
  if(map&&!fitted&&pts.length){map.fitBounds(pts,{padding:[50,50],maxZoom:12});fitted=true}
  $("list").innerHTML=h||'<p class="mut">لا يوجد سائقين مسجلين بعد.</p>';
  $("s1").textContent=D.length;$("s2").textContent=run;$("s3").textContent=arr;
}
function cp(t){
  if(navigator.clipboard)navigator.clipboard.writeText(t).then(function(){alert("تم نسخ الرابط، ابعته للسائق على واتساب")},function(){prompt("انسخ الرابط:",t)});
  else prompt("انسخ الرابط:",t);
}
initPick();showSel();
