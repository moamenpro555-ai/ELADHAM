// ================== عناصر الصفحة ==================
const videos = document.querySelectorAll("video");

// كل سنة: الزرار بتاعها + القسم بتاعها + (لو موجودة) القايمة اللي بتفتح تحتها
// sub4 / sub6 / sub8 مش موجودين في الابتدائي، فبتبقى null وكل حاجة بتشتغل عادي
const buttons = [
    { btn: document.getElementById("child4"), section: document.querySelector(".level1"), sub: document.querySelector(".sub4") },
    { btn: document.getElementById("child6"), section: document.querySelector(".level2"), sub: document.querySelector(".sub6") },
    { btn: document.getElementById("child8"), section: document.querySelector(".level3"), sub: document.querySelector(".sub8") }
].filter(function (item) {
    // الصفحة الرئيسية مفيهاش أزرار ولا مستويات، فنتجاهلها بدل ما يحصل إيرور
    return item.btn && item.section;
});

// ================== الأقسام جوه السنة (النحو - الأدب - ...) ==================
// الزرار id="sub4_1" بيفتح القسم class="part4_1" (نفس الرقم بالظبط)
function getParts(item) {
    return item.section.querySelectorAll('[class^="part"]');
}
function getPartOf(subBtn) {
    return document.querySelector("." + subBtn.id.replace("sub", "part"));
}

// دالة تعرض القسم المختار جوه السنة وتخفي الباقي (وتوقف فيديوهات الأقسام المخفية)
function showPart(item, selectedBtn) {
    item.sub.querySelectorAll(".child11").forEach(function (subBtn) {
        const part = getPartOf(subBtn);
        const isSelected = (subBtn === selectedBtn);
        subBtn.setAttribute("aria-pressed", isSelected ? "true" : "false");
        if (!part) return;
        part.style.display = isSelected ? "grid" : "none";
        if (!isSelected) {
            part.querySelectorAll("video").forEach(function (v) {
                v.pause();
            });
        }
    });
}

// ================== تبديل المستويات ==================
// دالة تعرض القسم المختار وتخفي الباقي (وتوقف فيديوهات الأقسام المخفية)
function showLevel(selected) {
    buttons.forEach(function (item) {
        const isSelected = (item === selected);
        item.section.style.display = isSelected ? "grid" : "none";
        item.btn.setAttribute("aria-pressed", isSelected ? "true" : "false");
        if (item.sub) {
            // القايمة بتفتح تحت السنة المختارة بس، وبتتقفل تحت الباقي
            item.sub.style.display = isSelected ? "flex" : "none";
            item.btn.setAttribute("aria-expanded", isSelected ? "true" : "false");
        }
        if (!isSelected) {
            item.section.querySelectorAll("video").forEach(function (v) {
                v.pause();
            });
        }
    });
    // أول ما تفتح سنة: اعرض أول قسم فيها (النحو)
    if (selected.sub) {
        showPart(selected, selected.sub.querySelector(".child11"));
    }
}

// عند الضغط على كل زر سنة
buttons.forEach(function (item) {
    item.btn.addEventListener("click", function () {
        const isOpen = item.sub && item.btn.getAttribute("aria-expanded") === "true";
        if (isOpen) {
            // السنة مفتوحة أصلًا: دوسة تانية تقفل القايمة بس (المحتوى يفضل ظاهر)
            item.sub.style.display = "none";
            item.btn.setAttribute("aria-expanded", "false");
        } else if (item.sub && item.btn.getAttribute("aria-pressed") === "true") {
            // السنة هي المختارة بس القايمة مقفولة: افتحها
            item.sub.style.display = "flex";
            item.btn.setAttribute("aria-expanded", "true");
        } else {
            showLevel(item);
        }
    });
    // عند الضغط على أزرار الأقسام (النحو - الأدب - ...)
    if (item.sub) {
        item.sub.querySelectorAll(".child11").forEach(function (subBtn) {
            subBtn.addEventListener("click", function () {
                showPart(item, subBtn);
            });
        });
    }
});

// أول ما الصفحة تفتح: اعرض المستوى الأول (بدل ما الصفحة تبقى فاضية)
if (buttons.length > 0) {
    showLevel(buttons[0]);
}

// ================== رفع ورقة الإجابة (امتحانات الشهر / الحصة) ==================
// رقم الواتساب بتاعك (بالصيغة الدولية من غير + ولا صفر)
const WHATSAPP_NUMBER = "201289695977";
// أقصى حجم للملف بالميجا
const MAX_FILE_MB = 15;

// كل مربع رفع class="up4_7" بيعرف السنة والقسم بتوعه من الرقم (child4 + sub4_7)
function setupUpload(box) {
    const nameInput = box.querySelector('input[type="text"]');
    const fileInput = box.querySelector('input[type="file"]');
    const sendBtn = box.querySelector("button");
    const note = box.querySelector('[class^="note"]');
    if (!fileInput || !sendBtn || !note) return;

    const ids = box.className.replace("up", "").split("_");
    const gradeBtn = document.getElementById("child" + ids[0]);
    const partBtn = document.getElementById("sub" + ids[0] + "_" + ids[1]);

    sendBtn.addEventListener("click", function () {
        const file = fileInput.files[0];
        if (!file) {
            note.textContent = "اختار الملف الأول.";
            return;
        }
        if (file.size > MAX_FILE_MB * 1024 * 1024) {
            note.textContent = "الملف كبير، أقصى حجم " + MAX_FILE_MB + " ميجا.";
            return;
        }

        const studentName = nameInput && nameInput.value.trim() ? nameInput.value.trim() : "طالب";
        const text = "السلام عليكم، أنا " + studentName + "\n"
            + (gradeBtn ? gradeBtn.textContent.trim() : "") + " - "
            + (partBtn ? partBtn.textContent.trim() : "") + "\n"
            + "ده ورقة إجابتي";

        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        if (isMobile && navigator.canShare && navigator.canShare({ files: [file] })) {
            // على الموبايل: تفتح قايمة المشاركة والطالب يختار واتساب ثم المدرس
            note.textContent = "اختار واتساب من القايمة وابعت الملف للمدرس.";
            navigator.share({ files: [file], text: text }).catch(function (err) {
                if (err.name !== "AbortError") {
                    note.textContent = "ماقدرناش نفتح المشاركة، جرّب تاني.";
                }
            });
        } else {
            // على الكمبيوتر: تفتح محادثة الواتساب بالمدرس والطالب يرفق الملف بنفسه
            window.open("https://wa.me/" + WHATSAPP_NUMBER + "?text=" + encodeURIComponent(text), "_blank", "noopener");
            note.textContent = "اتفتحت محادثة الواتساب، ارفق الملف بزرار المشبك واضغط إرسال.";
        }
    });
}
document.querySelectorAll('[class^="up"]').forEach(setupUpload);

// ================== تحميل الفيديو اللي المستخدم يختاره بس ==================
videos.forEach(function (v) {
    // ما يحمّلش أي حاجة من الفيديو غير لما المستخدم يدوس تشغيل
    v.preload = "none";
    v.setAttribute("preload", "none");
    // على الموبايل يشتغل جوه الصفحة مش بملء الشاشة غصب
    v.setAttribute("playsinline", "");

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
