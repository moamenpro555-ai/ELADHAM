/* login-hero.js — فيديو بيتحرك مع الماوس + كتابة تلقائية + ظهور الأزرار + قائمة الموبايل. بدون مكتبات. */
(function () {
    "use strict";

    // ---------- فيديو الخلفية: تحريك بالماوس (أو باللمس على الموبايل) ----------
    var video = document.getElementById("lh_video");
    var SENSITIVITY = 0.8;
    var targetTime = 0, seeking = false, prevX = null;
    function seekTo(t) { seeking = true; video.currentTime = t; }
    function move(x) {
        var d = video.duration;
        if (!d || !isFinite(d)) return;
        if (prevX === null) { prevX = x; return; }
        var delta = x - prevX; prevX = x;
        targetTime = Math.min(d, Math.max(0, targetTime + (delta / window.innerWidth) * SENSITIVITY * d));
        if (!seeking) seekTo(targetTime);
    }
    if (video) {
        video.muted = true;
        video.addEventListener("seeked", function () {
            seeking = false;
            if (Math.abs(video.currentTime - targetTime) > 0.01) seekTo(targetTime); // نكمّل لو الماوس اتحرك وقت التنقّل
        });
        window.addEventListener("mousemove", function (e) { move(e.clientX); });
        window.addEventListener("touchmove", function (e) { if (e.touches[0]) move(e.touches[0].clientX); }, { passive: true });
        window.addEventListener("touchend", function () { prevX = null; }, { passive: true });
    }

    // ---------- الكتابة التلقائية ----------
    function useTypewriter(el, cursor, text, speed, startDelay) {
        var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (reduce) { el.textContent = text; cursor.remove(); return; }
        var i = 0;
        window.setTimeout(function () {
            var iv = window.setInterval(function () {
                i++;
                el.textContent = text.slice(0, i);
                if (i >= text.length) { window.clearInterval(iv); cursor.remove(); } // المؤشر يختفي لما الكتابة تخلص
            }, speed);
        }, startDelay);
    }
    var tw = document.getElementById("lh_tw"), cur = document.getElementById("lh_cursor");
    if (tw && cur) useTypewriter(tw, cur, tw.getAttribute("data-text"), 38, 600);

    // ---------- ظهور الأزرار والكارت بعد 400ms (من غير ما يستنوا الكتابة) ----------
    window.setTimeout(function () {
        var p = document.getElementById("lh_pills"), c = document.getElementById("lh_card");
        if (p) p.classList.add("on");
        if (c) c.classList.add("on");
    }, 400);

    // ---------- نسخ رقم الواتساب ----------
    var copyBtn = document.getElementById("lh_copy");
    if (copyBtn) copyBtn.addEventListener("click", function () {
        var v = copyBtn.getAttribute("data-copy");
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).catch(function () {});
    });

    // ---------- قائمة الموبايل ----------
    var burger = document.getElementById("lh_burger"), ov = document.getElementById("lh_ov");
    if (burger && ov) {
        function toggle(open) {
            burger.classList.toggle("on", open); ov.classList.toggle("on", open);
            burger.setAttribute("aria-expanded", open ? "true" : "false");
        }
        burger.addEventListener("click", function () { toggle(!burger.classList.contains("on")); });
        ov.addEventListener("click", function (e) { if (e.target.tagName === "A") toggle(false); });
    }
})();
