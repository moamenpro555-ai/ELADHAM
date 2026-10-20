// ================== كروت الكورسات (كورسات / حصص / واجب) في صفحتي الإعدادي والثانوي ==================
// الكروت دي بتظهر لكل الزوار. الدخول للكورس نفسه بيحتاج حساب + اشتراك (بيتأكد منه السيرفر).
(function () {
    "use strict";
    var E = window.Eladham;
    if (!E) return;
    var stage = document.currentScript && document.currentScript.getAttribute("data-stage");
    var NAMES = { courses: "كورسات", sessions: "حصص", homework: "واجب" };

    function el(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text !== undefined) n.textContent = text;
        return n;
    }
    function card(c, n) {
        var d = el("div");
        var a = el("a"); a.href = "dashboard.html?course=" + encodeURIComponent(c.id);
        var img = el("img", "exam" + n + (c.hasCover ? " cvr" : "")); img.alt = c.title; img.loading = "lazy";
        img.src = c.hasCover ? String(window.ELADHAM_API || "").replace(/\/$/, "") + "/api/public/courses/" + encodeURIComponent(c.id) + "/cover" : "image/exam.svg";
        a.appendChild(img);
        d.appendChild(a);
        d.appendChild(el("p", "name" + n, c.title));
        var meta = (c.description ? c.description + " - " : "") + E.num(c.lessonCount) + " درس.";
        d.appendChild(el("p", "note" + n, meta));
        var price = c.accessMode === "free" ? "مجاني" : (c.accessMode === "code" ? "بالكود" : (c.price > 0 ? E.num(c.price) + " جنيه" : ""));
        if (price) d.appendChild(el("p", "card_price", price));
        var b = el("a", "buy_btn", "اشترك في الكورس"); b.href = "subscribe.html?course=" + encodeURIComponent(c.id);
        d.appendChild(b);
        return d;
    }

    async function init() {
        var parts = document.querySelectorAll('[data-area="courses"], [data-area="sessions"], [data-area="homework"]');
        if (!parts.length) return;
        var failed = false, list = [];
        try { list = (await E.call("GET", "/api/public/courses?stage=" + encodeURIComponent(stage))).courses; }
        catch (e) { failed = true; }
        Array.prototype.forEach.call(parts, function (p) {
            var grade = Number(p.getAttribute("data-grade")), area = p.getAttribute("data-area");
            var mine = list.filter(function (c) { return c.grade === grade && c.section === area; });
            while (p.firstChild) p.removeChild(p.firstChild);
            if (failed) { p.appendChild(el("p", "hint" + grade, "مش قادر أحمّل القسم ده دلوقتي. جرّب تحدّث الصفحة.")); return; }
            if (!mine.length) { p.appendChild(el("p", "hint" + grade, "لسه مفيش " + NAMES[area] + " هنا.")); return; }
            mine.forEach(function (c) { p.appendChild(card(c, grade)); });
        });
    }
    // exam-cards.js بيستنى الوعد ده علشان يضيف كروت الواجب بعد الكورسات
    E.coursesReady = new Promise(function (resolve) {
        function go() { init().then(resolve, resolve); }
        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
    });
})();
