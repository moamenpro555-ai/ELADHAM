/* fx.js — حركات خفيفة: ظهور تدريجي، شريط تقدّم، موجة على الأزرار، حركة التابات. بدون أي مكتبات. */
(function () {
    "use strict";
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // ---------- شريط التقدّم + ظل النافبار ----------
    var bar = document.createElement("div");
    bar.className = "fx_progress"; bar.setAttribute("aria-hidden", "true");
    document.body.appendChild(bar);
    var nav = document.querySelector("nav"), ticking = false;
    function onScroll() {
        if (ticking) return; ticking = true;
        window.requestAnimationFrame(function () {
            var h = document.documentElement, max = h.scrollHeight - h.clientHeight;
            bar.style.width = (max > 0 ? Math.min(100, (h.scrollTop / max) * 100) : 0) + "%";
            if (nav) nav.classList.toggle("fx_stuck", h.scrollTop > 8);
            ticking = false;
        });
    }
    window.addEventListener("scroll", onScroll, { passive: true }); onScroll();

    // ---------- الظهور التدريجي ----------
    var SEL = ".phase > div, main .text, .ac_card, .ac_course, .ac_lesson, .ac_qa, [class^='level'] > div, .hd3, .hd2, .hd1, .foot, .parent aside";
    var io = null;
    if (!reduce && "IntersectionObserver" in window) {
        io = new IntersectionObserver(function (entries) {
            entries.forEach(function (en) {
                if (!en.isIntersecting) return;
                var el = en.target; io.unobserve(el);
                var d = parseInt(el.getAttribute("data-fxd") || "0", 10);
                el.style.setProperty("--fx-d", d + "ms");
                window.requestAnimationFrame(function () {
                    el.classList.add("fx_in");
                    window.setTimeout(function () { el.classList.remove("fx_pre", "fx_in"); el.style.removeProperty("--fx-d"); }, 700 + d);
                });
            });
        }, { threshold: 0.08, rootMargin: "0px 0px -30px 0px" });
    }
    function prep(root) {
        if (!io) return;
        var list = root.querySelectorAll ? root.querySelectorAll(SEL) : [];
        var batch = 0;
        Array.prototype.forEach.call(list, function (el) {
            if (el.__fx) return; el.__fx = true;
            var r = el.getBoundingClientRect();
            el.classList.add("fx_pre");
            el.setAttribute("data-fxd", String((batch++ % 6) * 70));
            io.observe(el);
            // لو العنصر مخفي (تاب مش مفتوح) هيتلاحظ لما يظهر
            void r;
        });
    }
    prep(document);
    // العناصر اللي بتتضاف بعد التحميل (كروت الكورسات، الدروس، الأسئلة…)
    if ("MutationObserver" in window) {
        var pending = false, queue = [];
        new MutationObserver(function (muts) {
            muts.forEach(function (m) { Array.prototype.forEach.call(m.addedNodes, function (n) { if (n.nodeType === 1) queue.push(n); }); });
            if (pending || !queue.length) return; pending = true;
            window.setTimeout(function () {
                var q = queue; queue = []; pending = false;
                q.forEach(function (n) { if (n.matches && n.matches(SEL) && !n.__fx) { n.__fx = true; if (io) { n.classList.add("fx_pre"); io.observe(n); } } prep(n); });
            }, 30);
        }).observe(document.body, { childList: true, subtree: true });
    }

    // ---------- موجة على الأزرار ----------
    document.addEventListener("pointerdown", function (e) {
        if (reduce) return;
        var b = e.target.closest && e.target.closest(".ac_btn, .child10, .child11, .send3");
        if (!b || b.disabled) return;
        var r = b.getBoundingClientRect(), s = Math.max(r.width, r.height) / 2;
        var d = document.createElement("span");
        d.className = "fx_ripple";
        d.style.width = d.style.height = s + "px";
        d.style.left = (e.clientX - r.left - s / 2) + "px"; d.style.top = (e.clientY - r.top - s / 2) + "px";
        b.appendChild(d); window.setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 650);
    }, { passive: true });

    // ---------- حركة عند تبديل التابات (كورسات/امتحانات/حصص/واجب) ----------
    document.addEventListener("click", function (e) {
        if (reduce) return;
        var t = e.target.closest && e.target.closest(".child10, .child11");
        if (!t) return;
        window.setTimeout(function () {
            Array.prototype.forEach.call(document.querySelectorAll("[class^='part'], [class^='level']"), function (p) {
                if (p.tagName !== "DIV" && p.tagName !== "SECTION") return;
                if (p.offsetParent === null) return;
                p.classList.remove("fx_tab_in"); void p.offsetWidth; p.classList.add("fx_tab_in");
            });
        }, 20);
    });

    // ---------- الدرس المقفول يهتز / الدرس اللي اتفتح يلمع ----------
    document.addEventListener("click", function (e) {
        var l = e.target.closest && e.target.closest(".ac_lesson.is_locked");
        if (!l || reduce) return;
        l.classList.remove("fx_shake"); void l.offsetWidth; l.classList.add("fx_shake");
    });
    var wasLocked = {};
    if ("MutationObserver" in window) {
        new MutationObserver(function () {
            Array.prototype.forEach.call(document.querySelectorAll(".ac_lesson[data-id]"), function (b) {
                var id = b.getAttribute("data-id"), locked = b.classList.contains("is_locked");
                if (wasLocked[id] === true && !locked && !reduce) b.classList.add("fx_unlocked");
                wasLocked[id] = locked;
            });
        }).observe(document.body, { childList: true, subtree: true });
    }
})();
