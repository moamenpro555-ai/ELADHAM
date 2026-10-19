/* wow.js — حركات خفيفة: ظهور تدريجي وقت التمرير + ظل النافبار + وضع توفير للأجهزة الضعيفة. بدون أي مكتبات. */
(function () {
    "use strict";
    var root = document.documentElement;
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var conn = navigator.connection || {};
    var weak = conn.saveData || (navigator.deviceMemory && navigator.deviceMemory <= 2) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2);
    if (weak) root.classList.add("wow_lite");

    // ظل أقوى للنافبار بعد ما الصفحة تنزل شوية
    var nav = document.querySelector("nav"), ticking = false;
    function onScroll() {
        if (ticking || !nav) return; ticking = true;
        window.requestAnimationFrame(function () { nav.classList.toggle("wow_scrolled", window.scrollY > 8); ticking = false; });
    }
    window.addEventListener("scroll", onScroll, { passive: true }); onScroll();

    if (reduce || !("IntersectionObserver" in window)) return;
    // العناصر اللي بتظهر تدريجي (كروت الصفحات اللي فيها أنيميشن CSS لوحدها مش داخلة هنا)
    var SEL = ".phase > div, .hr_sc, .wow_ol li, .wow_cta, .text, .ac_card, .ac_course, .ac_lesson";
    var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
            if (!en.isIntersecting) return;
            var el = en.target; io.unobserve(el);
            window.requestAnimationFrame(function () {
                el.classList.add("wow_in");
                window.setTimeout(function () { el.classList.remove("wow_pre", "wow_in"); el.style.removeProperty("--wd"); }, 900);
            });
        });
    }, { threshold: 0.1, rootMargin: "0px 0px -40px 0px" });
    var seen = new WeakSet();
    function watch(scope) {
        var list = scope.querySelectorAll ? scope.querySelectorAll(SEL) : [];
        Array.prototype.forEach.call(list, function (el, i) {
            if (seen.has(el)) return; seen.add(el);
            el.classList.add("wow_pre"); el.style.setProperty("--wd", ((i % 5) * 80) + "ms");
            io.observe(el);
        });
    }
    watch(document);
    // عناصر بتتضاف بعد التحميل (دروس، كروت لوحة الطالب)
    if ("MutationObserver" in window) {
        var queue = [], busy = false;
        new MutationObserver(function (muts) {
            muts.forEach(function (m) { Array.prototype.forEach.call(m.addedNodes, function (n) { if (n.nodeType === 1) queue.push(n); }); });
            if (busy || !queue.length) return; busy = true;
            window.setTimeout(function () { var q = queue; queue = []; busy = false; q.forEach(function (n) { if (n.matches && n.matches(SEL) && !seen.has(n)) { seen.add(n); n.classList.add("wow_pre"); io.observe(n); } watch(n); }); }, 40);
        }).observe(document.body, { childList: true, subtree: true });
    }
})();
