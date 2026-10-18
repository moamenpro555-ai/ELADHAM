// ================== بيحط امتحانات الطالب (من السيرفر) جوه كروت امتحانات الشهر والحصة ==================
// بيشتغل في index3 (إعدادي) و index4 (ثانوي). الطالب غير المسجّل ما بيشوفش حاجة جديدة.
(function () {
    "use strict";
    var E = window.Eladham;
    if (!E) return;
    var stage = document.currentScript && document.currentScript.getAttribute("data-stage");

    function isPlaceholder(card) {
        var img = card.querySelector("img");
        return !!img && /exam\.svg$/.test(img.getAttribute("src") || "");
    }
    function cardsOf(grid) {
        return Array.prototype.filter.call(grid.children, function (c) { return c.tagName === "DIV" && c.querySelector("a > img"); });
    }
    function fill(card, ex) {
        var a = card.querySelector("a"), img = card.querySelector("img"), p = card.querySelector("p");
        a.setAttribute("href", "paper.html?id=" + ex.id);
        img.setAttribute("alt", ex.title);
        if (p) p.textContent = ex.title;
        card.setAttribute("data-exam-id", String(ex.id));
        if (ex.hasCover) {
            E.blobUrl("/api/exams/" + ex.id + "/cover").then(function (u) { img.src = u; }, function () {});
        }
    }
    function addCard(grid, ex) {
        var cards = cardsOf(grid), tpl = cards[0];
        if (!tpl) return;
        var c = tpl.cloneNode(true);
        c.querySelector("img").setAttribute("src", "image/exam.svg");
        grid.appendChild(c);
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
        var out = [];
        Array.prototype.forEach.call(document.querySelectorAll("div"), function (d) {
            var m = /(?:^|\s)part(\d+)_(7|8)(?:\s|$)/.exec(d.className || "");
            if (m) out.push({ el: d, year: Number(m[1]), kind: m[2] === "7" ? "month" : "session" });
        });
        return out;
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
        var years = []; gs.forEach(function (g) { if (years.indexOf(g.year) < 0) years.push(g.year); });
        years.sort(function (a, b) { return a - b; });
        gs.forEach(function (g) {
            var grade = years.indexOf(g.year) + 1;
            var mine = list.filter(function (x) { return x.stage === stage && x.grade === grade && x.kind === g.kind; })
                .sort(function (x, y) { return (x.sessionNo ? 0 : 1) - (y.sessionNo ? 0 : 1); });
            mine.forEach(function (ex) {
                var cards = cardsOf(g.el), target = null;
                if (g.kind === "month") {
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
                if (target) fill(target, ex); else addCard(g.el, ex);
            });
        });
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
