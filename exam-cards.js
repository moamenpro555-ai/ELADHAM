// ================== بيحط امتحانات الطالب (من السيرفر) جوه كروت امتحانات الشهر والحصة ==================
// بيشتغل في index3 (إعدادي) و index4 (ثانوي) جوه قسم "امتحانات". الطالب غير المسجّل بيشوف رابط تسجيل الدخول.
(function () {
    "use strict";
    var E = window.Eladham;
    if (!E) return;
    var stage = document.currentScript && document.currentScript.getAttribute("data-stage");

    function isPlaceholder(card) {
        var img = card.querySelector("img");
        return !!img && /exam\.svg$/.test(img.getAttribute("src") || "");
    }
    function cardsOf(grid, kind) {
        return Array.prototype.filter.call(grid.children, function (c) {
            return c.tagName === "DIV" && c.querySelector("a > img") && (!kind || c.getAttribute("data-kind") === kind);
        });
    }
    function fill(card, ex) {
        var a = card.querySelector("a"), img = card.querySelector("img"), p = card.querySelector("p");
        a.setAttribute("href", "paper.html?id=" + ex.id);
        img.setAttribute("alt", ex.title);
        if (p) p.textContent = ex.title;
        if (!ex.hasCover) img.setAttribute("src", "image/exam.svg");
        card.setAttribute("data-exam-id", String(ex.id));
        if (ex.hasCover) {
            E.blobUrl("/api/exams/" + ex.id + "/cover").then(function (u) { img.src = u; img.classList.add("cvr"); }, function () {});
        }
    }
    function addCard(grid, kind, ex) {
        var cards = cardsOf(grid, kind), tpl = cards[0] || cardsOf(grid)[0];
        if (!tpl) return;
        var c = tpl.cloneNode(true);
        c.removeAttribute("data-exam-id");
        c.setAttribute("data-kind", kind);
        c.querySelector("img").setAttribute("src", "image/exam.svg");
        var last = cards[cards.length - 1] || tpl;
        last.parentNode.insertBefore(c, last.nextSibling);
        fill(c, ex);
    }
    function hint(grid) {
        if (grid.querySelector(".exam_hint")) return;
        var p = document.createElement("p");
        p.className = "exam_hint";
        p.style.cssText = "width:100%;text-align:center;margin:8px 0;font-size:14px";
        var a = document.createElement("a");
        a.href = "login.html"; a.textContent = "سجّل دخولك";
        p.appendChild(a);
        p.appendChild(document.createTextNode(" عشان تشوف امتحاناتك هنا."));
        grid.insertBefore(p, grid.firstChild);
    }

    function grids() {
        return Array.prototype.map.call(document.querySelectorAll('[data-area="exams"]'), function (d) {
            return { el: d, grade: Number(d.getAttribute("data-grade")) };
        });
    }

    async function init() {
        var gs = grids();
        if (!gs.length) return;
        var user = null, list = [];
        try {
            user = await E.loadSession();
            if (user && user.role === "student") list = (await E.call("GET", "/api/exams")).exams;
        } catch (e) { user = null; }
        if (!user) { gs.forEach(function (g) { hint(g.el); }); return; }
        if (user.role !== "student") return;
        gs.forEach(function (g) {
            var mine = list.filter(function (x) { return x.stage === stage && x.grade === g.grade; })
                .sort(function (x, y) { return (x.sessionNo ? 0 : 1) - (y.sessionNo ? 0 : 1); });
            mine.forEach(function (ex) {
                if (ex.kind === "homework") return; // الواجب بيتحط في قسم الواجب تحت
                var cards = cardsOf(g.el, ex.kind), target = null;
                if (ex.kind === "month") {
                    var name = "امتحان شهر " + E.MONTHS[ex.month];
                    cards.forEach(function (c) {
                        var p = c.querySelector("p");
                        if (!target && !c.getAttribute("data-exam-id") && isPlaceholder(c) && p && p.textContent.trim() === name) target = c;
                    });
                } else if (ex.sessionNo) {
                    // رقم الحصة بيحدد الكارت: 1 = الكارت الأول، 2 = التاني ... (ولو الكارت ده متاخد بامتحان تاني، بيتضاف كارت جديد)
                    var slot = cards[ex.sessionNo - 1];
                    if (slot && !slot.getAttribute("data-exam-id")) target = slot;
                } else {
                    cards.forEach(function (c) { if (!target && !c.getAttribute("data-exam-id") && isPlaceholder(c)) target = c; });
                }
                if (target) fill(target, ex); else addCard(g.el, ex.kind, ex);
            });
        });
    }
    // ورقة الواجب (صور / PDF): بتظهر في قسم "واجب" بس، للمرحلة والصف اللي المدرس حدده
    async function homework() {
        var areas = Array.prototype.slice.call(document.querySelectorAll('[data-area="homework"]'));
        if (!areas.length) return;
        try { await (E.coursesReady || Promise.resolve()); } catch (e) { /* */ }
        var user = null, list = [];
        try {
            user = await E.loadSession();
            if (user && user.role === "student") list = (await E.call("GET", "/api/exams")).exams;
        } catch (e) { return; }
        if (!user || user.role !== "student") return;
        areas.forEach(function (area) {
            var grade = Number(area.getAttribute("data-grade"));
            var mine = list.filter(function (x) { return x.kind === "homework" && x.stage === stage && x.grade === grade; });
            if (!mine.length) return;
            Array.prototype.forEach.call(area.querySelectorAll('[class^="hint"]'), function (n) { n.remove(); });
            mine.forEach(function (ex) {
                var d = document.createElement("div"); d.setAttribute("data-exam-id", String(ex.id));
                var a = document.createElement("a"); a.href = "paper.html?id=" + encodeURIComponent(ex.id);
                var img = document.createElement("img"); img.className = "exam" + grade; img.alt = ex.title; img.loading = "lazy"; img.src = "image/exam.svg";
                if (ex.hasCover) E.blobUrl("/api/exams/" + ex.id + "/cover").then(function (u) { img.src = u; img.classList.add("cvr"); }, function () {});
                a.appendChild(img); d.appendChild(a);
                var nm = document.createElement("p"); nm.className = "name" + grade; nm.textContent = ex.title; d.appendChild(nm);
                var nt = document.createElement("p"); nt.className = "note" + grade; nt.textContent = (ex.description ? ex.description + " - " : "") + E.num(ex.questionCount) + " سؤال"; d.appendChild(nt);
                area.appendChild(d);
            });
        });
    }
    function start() { init(); homework(); }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
