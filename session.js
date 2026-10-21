// ================== مشاهدة حصة فيديو ==================
(function () {
    "use strict";
    var E = window.Eladham, h = E.h;
    var root = document.getElementById("ac_root");
    var user = null, saveTimer = 0;
    var id = new URLSearchParams(location.search).get("id");
    function save() { /* الحصص مفيهاش تتبّع تقدّم */ }

    var activeLesson = null;
    var saveTimer = 0;

    // يوتيوب وجوجل درايف مش بيشتغلوا في <video>، فبنحوّل رابطهم لمشغّل مدمج (iframe)
    function embedFor(u) {
        var x;
        try { x = new URL(u); } catch (e) { return null; }
        var host = x.hostname.replace(/^(www\.|m\.)/, ""), id = null, m;
        if (host === "youtu.be") id = x.pathname.slice(1).split("/")[0];
        else if (host === "youtube.com" || host === "youtube-nocookie.com") {
            if (x.pathname === "/watch") id = x.searchParams.get("v");
            else if ((m = /^\/(?:embed|shorts|live|v)\/([^/?]+)/.exec(x.pathname))) id = m[1];
        }
        if (id && /^[A-Za-z0-9_-]{6,20}$/.test(id)) return "https://www.youtube-nocookie.com/embed/" + id + "?rel=0&modestbranding=1&playsinline=1";
        if (host === "drive.google.com" && (m = /^\/file\/d\/([A-Za-z0-9_-]+)/.exec(x.pathname))) return "https://drive.google.com/file/d/" + m[1] + "/preview";
        return null;
    }
    function youtubeId(u) {
        var e = embedFor(u), m = e && /youtube-nocookie\.com\/embed\/([^?]+)/.exec(e);
        return m ? m[1] : null;
    }
    var ytLoading = null;
    function loadYT() {
        if (window.YT && window.YT.Player) return Promise.resolve();
        if (ytLoading) return ytLoading;
        ytLoading = new Promise(function (res, rej) {
            var prev = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = function () { if (prev) prev(); res(); };
            var s = document.createElement("script");
            s.src = "https://www.youtube.com/iframe_api";
            s.onerror = function () { ytLoading = null; rej({ message: "مش قادر أحمّل مشغّل الفيديو. اتأكد من النت وجرّب تاني." }); };
            document.head.appendChild(s);
        });
        return ytLoading;
    }
    function clock(s) { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }

    // مشغّل يوتيوب بأزرارنا إحنا: من غير عنوان ولا روابط يوتيوب قابلة للضغط، وعليه اسم الطالب كعلامة مائية
    async function openYouTube(l, id, holder, onEnded) {
        await loadYT();
        var mount = h("div", { class: "ac_vp_mount" });
        var shield = h("div", { class: "ac_vp_shield", title: "تشغيل / إيقاف" });
        var mark = h("div", { class: "ac_vp_mark", text: (user && user.name ? user.name : "") + " - " + (user && user.email ? user.email : "") });
        var screen = h("div", { class: "ac_vp_screen" }, [mount, shield, mark]);
        var play = h("button", { type: "button", class: "ac_btn b_dark b_sm", text: "تشغيل" });
        var seek = h("input", { type: "range", min: "0", max: "1000", value: "0", class: "ac_vp_seek", "aria-label": "مكان الفيديو" });
        var time = h("span", { class: "ac_vp_time", text: "0:00" });
        var speed = h("select", { "aria-label": "السرعة" }, [0.5, 0.75, 1, 1.25, 1.5, 2].map(function (x) { return h("option", { value: String(x), text: x + "x", selected: x === 1 ? true : false }); }));
        var full = h("button", { type: "button", class: "ac_btn b_line b_sm", text: "ملء الشاشة" });
        var bar = h("div", { class: "ac_vp_bar" }, [play, seek, time, speed, full]);
        var wrap = h("div", { class: "ac_vp_wrap" }, [screen, bar]);
        holder.replaceWith(wrap);
        var player, dragging = false, tick = 0, moveTimer = 0, lastSave = 0;
        function playing() { return player && player.getPlayerState && player.getPlayerState() === 1; }
        function toggle() { if (!player || !player.playVideo) return; if (playing()) player.pauseVideo(); else player.playVideo(); }
        function refresh() {
            if (!player || !player.getDuration) return;
            var d = player.getDuration() || 0, c = player.getCurrentTime() || 0;
            if (!dragging && d) seek.value = String(Math.round(c / d * 1000));
            time.textContent = clock(c) + " / " + clock(d);
            if (playing() && Date.now() - lastSave > 20000) { lastSave = Date.now(); save(l, { positionSeconds: Math.floor(c) }); }
        }
        function moveMark() {
            mark.style.top = (8 + Math.random() * 74) + "%";
            mark.style.left = (4 + Math.random() * 55) + "%";
        }
        shield.addEventListener("click", toggle);
        shield.addEventListener("contextmenu", function (e) { e.preventDefault(); });
        play.addEventListener("click", toggle);
        seek.addEventListener("input", function () { dragging = true; });
        seek.addEventListener("change", function () { dragging = false; var d = player.getDuration() || 0; player.seekTo(d * Number(seek.value) / 1000, true); refresh(); });
        speed.addEventListener("change", function () { player.setPlaybackRate(Number(speed.value)); });
        full.addEventListener("click", function () {
            if (document.fullscreenElement) document.exitFullscreen();
            else if (wrap.requestFullscreen) wrap.requestFullscreen();
        });
        moveMark();
        player = new window.YT.Player(mount, {
            host: "https://www.youtube-nocookie.com", videoId: id,
            playerVars: { controls: 0, disablekb: 1, rel: 0, modestbranding: 1, iv_load_policy: 3, fs: 0, playsinline: 1, origin: location.origin, start: l.positionSeconds > 5 ? l.positionSeconds : 0 },
            events: {
                onStateChange: function (e) {
                    play.textContent = e.data === 1 ? "إيقاف" : "تشغيل";
                    if (e.data === 2) save(l, { positionSeconds: Math.floor(player.getCurrentTime()) });
                    if (e.data === 0) { play.textContent = "تشغيل"; if (onEnded) onEnded(); }
                }
            }
        });
        window.clearInterval(tick); window.clearInterval(moveTimer);
        tick = window.setInterval(refresh, 500);
        moveTimer = window.setInterval(moveMark, 15000);
        saveTimer = window.setInterval(function () { if (!document.body.contains(wrap)) { window.clearInterval(tick); window.clearInterval(moveTimer); window.clearInterval(saveTimer); } }, 2000);
    }
    function safeHttpUrl(u) {
        try { var x = new URL(u); return (x.protocol === "https:" || x.protocol === "http:") ? x.href : null; } catch (e) { return null; }
    }


    function fail(m) { E.clear(root); root.appendChild(h("div", { class: "ac_card" }, [h("p", { class: "ac_msg", text: m }), h("a", { class: "ac_btn b_line", href: "dashboard.html", text: "رجوع لحسابي" })])); }

    async function load() {
        var d;
        try { d = await E.call("GET", "/api/sessions/" + encodeURIComponent(id) + "/playback"); }
        catch (e) { fail(e.status === 404 ? "الحصة دي مش متاحة ليك (لازم تكون من نفس المرحلة والصف)." : (e.message || "حصل خطأ")); return; }
        var s = d.session, url = safeHttpUrl(d.playback.url);
        document.title = "الادهم - " + s.title;
        E.clear(root);
        var holder = h("p", { class: "ac_empty", text: "بنجهّز الحصة..." });
        root.appendChild(h("div", { class: "ac_card" }, [
            h("div", { class: "ac_top" }, [h("div", null, [h("h1", { class: "ac_h1", text: s.title }), h("p", { class: "ac_sub", text: E.placeLabel(s.stage, s.grade) + " - حصة فيديو" }),
                s.description ? h("p", { class: "ac_sub", text: s.description }) : null]),
                h("a", { class: "ac_btn b_line", href: "dashboard.html", text: "رجوع" })]),
            holder]));
        try {
            if (!url) throw { message: "رابط الحصة غير صالح. بلّغ المدرس." };
            if (youtubeId(url)) await openYouTube({ positionSeconds: 0 }, youtubeId(url), holder, null);
            else if (embedFor(url)) holder.replaceWith(h("iframe", { class: "ac_embed", src: embedFor(url), title: s.title, allowfullscreen: true, allow: "fullscreen; encrypted-media; picture-in-picture", referrerpolicy: "strict-origin-when-cross-origin" }));
            else { var v = h("video", { controls: true, controlsList: "nodownload", playsinline: true, preload: "metadata", id: "sv_video" }); v.src = url; holder.replaceWith(v); }
        } catch (e) { holder.replaceWith(h("p", { class: "ac_msg", text: (e && e.message) || "مش قادر أشغّل الحصة" })); }
    }

    E.requireUser("student").then(function (u) {
        if (!u) return;
        user = u;
        if (u.mustChangePassword) { location.replace("dashboard.html"); return; }
        if (!id || !/^[0-9a-f-]{36}$/i.test(id)) { fail("رابط الحصة غير صحيح."); return; }
        return load();
    }).catch(function (e) { fail(e.message || "حصل خطأ"); });
})();
