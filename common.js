// دوال مشتركة بين صفحة الإدارة وصفحة السائق
var C={"القاهرة":[30.04,31.24],"الإسكندرية":[31.20,29.92],"طنطا":[30.79,31.00],"بورسعيد":[31.26,32.30],"السويس":[29.97,32.55],"أسيوط":[27.18,31.18],"الأقصر":[25.69,32.64],"أسوان":[24.09,32.90]};
// المسافة بالكيلومتر (خط مستقيم). أقل من 10 كم بنعرض كسر عشري
function km(a,b,c,d){var r=Math.PI/180,x=(c-a)*r,y=(d-b)*r*Math.cos((a+c)*r/2),v=Math.sqrt(x*x+y*y)*6371;return v<10?Math.round(v*10)/10:Math.round(v)}
// الوجهة التفصيلية بتتخزن في نفس حقل destination بالشكل: "العنوان @@ lat,lng"
var SEP=" @@ ";
function encDest(label,lat,lng){return String(label).slice(0,100)+SEP+lat.toFixed(5)+","+lng.toFixed(5)}
function parseDest(s){
  s=s||"";var i=s.lastIndexOf(SEP);
  if(i>-1){var p=s.slice(i+SEP.length).split(",").map(Number);
    if(p.length==2&&isFinite(p[0])&&isFinite(p[1]))return{label:s.slice(0,i),lat:p[0],lng:p[1],exact:true}}
  var c=C[s];
  return c?{label:s,lat:c[0],lng:c[1],exact:false}:{label:s,lat:null,lng:null,exact:false};
}
