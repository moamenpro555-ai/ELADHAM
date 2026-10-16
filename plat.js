// ================== عناصر الصفحة ==================
const videos = document.querySelectorAll("video");

const buttons = [
    { btn: document.getElementById("child4"), section: document.querySelector(".level1") },
    { btn: document.getElementById("child6"), section: document.querySelector(".level2") },
    { btn: document.getElementById("child8"), section: document.querySelector(".level3") }
].filter(function (item) {
    // الصفحة الرئيسية مفيهاش أزرار ولا مستويات، فنتجاهلها بدل ما يحصل إيرور
    return item.btn && item.section;
});

// ================== تبديل المستويات ==================
// دالة تعرض القسم المختار وتخفي الباقي (وتوقف فيديوهات الأقسام المخفية)
function showLevel(selected) {
    buttons.forEach(function (item) {
        const isSelected = (item === selected);
        item.section.style.display = isSelected ? "grid" : "none";
        item.btn.setAttribute("aria-pressed", isSelected ? "true" : "false");
        if (!isSelected) {
            item.section.querySelectorAll("video").forEach(function (v) {
                v.pause();
            });
        }
    });
}

// عند الضغط على كل زر
buttons.forEach(function (item) {
    item.btn.addEventListener("click", function () {
        showLevel(item);
    });
});

// أول ما الصفحة تفتح: اعرض المستوى الأول (بدل ما الصفحة تبقى فاضية)
if (buttons.length > 0) {
    showLevel(buttons[0]);
}

// ================== تحميل الفيديو اللي المستخدم يختاره بس ==================
videos.forEach(function (v) {
    // ما يحمّلش أي حاجة من الفيديو غير لما المستخدم يدوس تشغيل
    v.preload = "none";
    v.setAttribute("preload", "none");

    // لما فيديو يشتغل، وقف أي فيديو تاني شغال
    v.addEventListener("play", function () {
        videos.forEach(function (other) {
            if (other !== v) other.pause();
        });
    });
});

// ================== حماية الفيديوهات (تصعيب مش منع تام) ==================
videos.forEach(function (v) {
    // منع زرار التحميل وتشغيل الفيديو في نافذة منفصلة
    v.setAttribute("controlsList", "nodownload noplaybackrate");
    v.disablePictureInPicture = true;
    // منع الضغط كليك يمين على الفيديو
    v.addEventListener("contextmenu", function (e) {
        e.preventDefault();
    });
});

// منع كليك يمين على أي فيديو
document.addEventListener("contextmenu", function (e) {
    if (e.target.tagName === "VIDEO") e.preventDefault();
});

// لما تتضغط PrintScreen: وقف الفيديوهات وامسح الكليب بورد
document.addEventListener("keyup", function (e) {
    if (e.key === "PrintScreen") {
        videos.forEach(function (v) { v.pause(); });
        if (navigator.clipboard) navigator.clipboard.writeText("").catch(function () {});
    }
});

// لما الطالب يخرج من التاب أو يطفي الشاشة: وقف الفيديو
// (من غير ما نخفيه، عشان الفيديو ما يختفيش على الموبايل لما يجي إشعار أو تدوس برا الصفحة)
document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
        videos.forEach(function (v) { v.pause(); });
    }
});
