// ================== لوحة الطالب ==================
(function () {
    "use strict";
    var E = window.Eladham, h = E.h;
    var root = document.getElementById("ac_root");
    var user = null;
    var current = null;      // { course, lessons }
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
    async function openYouTube(l, id, holder) {
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
                    if (e.data === 0) { play.textContent = "تشغيل"; markDone(l, true); }
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

    function header() {
        // لو لازم يغيّر كلمة السر، النموذج بيظهر تحت في البانر بس (علشان ميتكرّرش)
        var pwBox = user.mustChangePassword ? null : h("div", { class: "ac_hidden", id: "ac_pwbox" }, [E.passwordForm({})]);
        return h("div", { class: "ac_card" }, [
            h("div", { class: "ac_top" }, [
                h("div", null, [h("h1", { class: "ac_h1", text: "أهلًا يا " + user.name }), h("p", { class: "ac_sub", text: user.email, dir: "ltr" })]),
                h("div", { class: "ac_row" }, [
                    pwBox ? h("button", { type: "button", class: "ac_btn b_line", text: "تغيير كلمة السر", onclick: function () { pwBox.classList.toggle("ac_hidden"); } }) : null,
                    h("button", { type: "button", class: "ac_btn b_dark", text: "تسجيل الخروج", onclick: function () { E.logout(); } })
                ])
            ]),
            pwBox
        ]);
    }

    async function showHome() {
        window.clearInterval(saveTimer);
        current = null; activeLesson = null;
        E.clear(root);
        root.appendChild(header());
        if (user.mustChangePassword) {
            root.appendChild(h("div", { class: "ac_banner", text: "علشان حسابك يبقى آمن، لازم تغيّر كلمة السر المؤقتة قبل ما تكمل." }));
            var f = E.passwordForm({ onDone: function () { location.reload(); } });
            root.appendChild(h("div", { class: "ac_card" }, [h("h2", { class: "ac_h2", text: "كلمة سر جديدة" }), f]));
            return;
        }
        var box = h("div", { class: "ac_card" }, [h("h2", { class: "ac_h2", text: "كورساتي" }), h("p", { class: "ac_empty", text: "جاري التحميل..." })]);
        root.appendChild(box);
        try {
            var d = await E.call("GET", "/api/courses");
            var mine = d.courses.filter(function (c) { return c.enrolled; });
            var others = d.courses.filter(function (c) { return !c.enrolled; });
            E.clear(box);
            box.appendChild(h("h2", { class: "ac_h2", text: "كورساتي" }));
            if (!mine.length) box.appendChild(h("p", { class: "ac_empty", text: "لسه مفيش كورسات مفعّلة على حسابك. كلّم المدرس عشان يفعّلها." }));
            else box.appendChild(h("div", { class: "ac_grid" }, mine.map(courseCard)));
            root.appendChild(await examsCard());
            if (others.length) {
                var more = h("div", { class: "ac_card" }, [h("h2", { class: "ac_h2", text: "كورسات تانية متاحة" }),
                    h("p", { class: "ac_sub", text: "كلّم المدرس لو عايز تشترك فيها." }),
                    h("div", { class: "ac_grid" }, others.map(courseCard))]);
                root.appendChild(more);
            }
        } catch (e) { E.clear(box); box.appendChild(h("p", { class: "ac_msg", text: e.message })); }
    }

    // ---------- الامتحانات ----------
    async function examsCard() {
        var card = h("div", { class: "ac_card" }, [h("h2", { class: "ac_h2", text: "الامتحانات" }), h("p", { class: "ac_empty", text: "جاري التحميل..." })]);
        try {
            var d = await E.call("GET", "/api/exams");
            E.clear(card);
            card.appendChild(h("h2", { class: "ac_h2", text: "الامتحانات" }));
            if (!d.exams.length) { card.appendChild(h("p", { class: "ac_empty", text: "مفيش امتحانات متاحة لصفك دلوقتي." })); return card; }
            var groups = [], seen = {};
            d.exams.forEach(function (x) {
                var key = x.kind === "month" ? "m" + x.month : "s";
                if (!seen[key]) { seen[key] = { title: x.kind === "month" ? "امتحانات شهر " + E.MONTHS[x.month] : "امتحانات الحصة", items: [], order: x.kind === "month" ? 100 + x.month : 0 }; groups.push(seen[key]); }
                seen[key].items.push(x);
            });
            groups.sort(function (a, b) { return a.order - b.order; });
            groups.forEach(function (g) {
                card.appendChild(h("h3", { class: "ac_group_t", text: g.title }));
                card.appendChild(h("div", { class: "ac_grid" }, g.items.map(examCard)));
            });
        } catch (e) { E.clear(card); card.appendChild(h("p", { class: "ac_msg", text: e.message })); }
        return card;
    }
    function examCard(x) {
        var kids = [];
        if (x.hasCover) {
            var img = h("img", { class: "ac_cover", alt: "", loading: "lazy" });
            E.blobUrl("/api/exams/" + x.id + "/cover").then(function (u) { img.src = u; }, function () { img.remove(); });
            kids.push(img);
        }
        kids.push(h("span", { class: "ac_course_t", text: x.title }));
        if (x.description) kids.push(h("span", { class: "ac_course_m", text: x.description }));
        kids.push(h("span", { class: "ac_course_m", text: E.num(x.questionCount) + " سؤال" }));
        if (x.attemptsUsed) kids.push(h("span", { class: "ac_pill p_ok", text: "أعلى درجة: " + E.num(x.bestScore) + " / " + E.num(x.questionCount) }));
        else kids.push(h("span", { class: "ac_pill", text: "لسه ما اتحلش" }));
        return h("a", { class: "ac_course", href: "paper.html?id=" + encodeURIComponent(x.id), style: "text-decoration:none" }, kids);
    }

    function courseCard(c) {
        var inner = [
            h("span", { class: "ac_course_t", text: c.title }),
            h("span", { class: "ac_course_m", text: E.courseLabel(c) }),
            c.description ? h("span", { class: "ac_course_m", text: c.description }) : null
        ];
        if (c.enrolled) {
            inner.push(h("div", { class: "ac_bar", role: "progressbar", "aria-valuenow": String(c.progressPercent), "aria-valuemin": "0", "aria-valuemax": "100" }, [h("span", { style: "width:" + c.progressPercent + "%" })]));
            inner.push(h("span", { class: "ac_course_m", text: E.num(c.completedCount) + " من " + E.num(c.lessonCount) + " درس (" + E.num(c.progressPercent) + "٪)" }));
            return h("button", { type: "button", class: "ac_course", onclick: function () { openCourse(c.id); } }, inner);
        }
        inner.push(h("span", { class: "ac_pill", text: "غير مشترك" }));
        return h("div", { class: "ac_course is_locked" }, inner);
    }

    async function openCourse(id) {
        try {
            var d = await E.call("GET", "/api/courses/" + encodeURIComponent(id));
            if (d.course.enrolled === false && user && user.role === "student") { E.toast("مش مشترك في الكورس ده. كلّم المدرس عشان يفعّله على حسابك.", "bad"); return; }
            current = d;
            renderCourse();
        } catch (e) { E.toast(e.message, "bad"); }
    }

    function renderCourse() {
        E.clear(root);
        root.appendChild(header());
        var c = current.course;
        var player = h("div", { class: "ac_player", id: "ac_player" }, [h("p", { class: "ac_empty", text: "اختار درس من القايمة." })]);
        var list = h("ul", { class: "ac_list", id: "ac_lessons" }, current.lessons.map(function (l) { return h("li", null, [lessonBtn(l)]); }));
        if (!current.lessons.length) list = h("p", { class: "ac_empty", text: "مفيش دروس منشورة في الكورس ده لسه." });
        root.appendChild(h("div", { class: "ac_card" }, [
            h("div", { class: "ac_top" }, [
                h("div", null, [h("h2", { class: "ac_h1", text: c.title }), h("p", { class: "ac_sub", text: E.courseLabel(c) })]),
                h("button", { type: "button", class: "ac_btn b_line", text: "رجوع للكورسات", onclick: showHome })
            ])
        ]));
        root.appendChild(h("div", { class: "ac_split" }, [h("div", { class: "ac_card" }, [player]), h("div", { class: "ac_card" }, [h("h2", { class: "ac_h2", text: "الدروس" }), list])]));
    }

    function lessonBtn(l) {
        var b = h("button", { type: "button", class: "ac_lesson" + (l.completed ? " is_done" : ""), "data-id": l.id, onclick: function () { openLesson(l); } }, [
            h("span", { class: "ic", text: l.completed ? "✓" : (l.kind === "exam" ? "؟" : "▶") }),
            h("span", { text: l.title })
        ]);
        return b;
    }

    async function openLesson(l) {
        window.clearInterval(saveTimer);
        activeLesson = l;
        Array.prototype.forEach.call(document.querySelectorAll(".ac_lesson"), function (b) { b.classList.toggle("is_on", b.getAttribute("data-id") === l.id); });
        var player = E.clear(document.getElementById("ac_player"));
        player.appendChild(h("h3", { class: "ac_h2", text: l.title }));
        if (l.description) player.appendChild(h("p", { class: "ac_sub", text: l.description }));
        player.appendChild(h("p", { class: "ac_empty", text: "بنجهّز الدرس..." }));
        var holder = player.lastChild;
        try {
            var d = await E.call("GET", "/api/lessons/" + encodeURIComponent(l.id) + "/playback");
            var url = safeHttpUrl(d.playback.url);
            if (!url) throw { message: "رابط الدرس غير صالح. بلّغ المدرس." };
            if (l.kind === "exam") {
                holder.replaceWith(h("a", { class: "ac_btn b_gold", href: url, target: "_blank", rel: "noopener", text: "ابدأ الامتحان" }));
            } else if (youtubeId(url)) {
                await openYouTube(l, youtubeId(url), holder);
            } else if (embedFor(url)) {
                holder.replaceWith(h("iframe", { class: "ac_embed", src: embedFor(url), title: l.title, allowfullscreen: true,
                    allow: "fullscreen; encrypted-media; picture-in-picture", referrerpolicy: "strict-origin-when-cross-origin" }));
            } else {
                var v = h("video", { controls: true, controlsList: "nodownload", playsinline: true, preload: "metadata" });
                v.src = url;
                holder.replaceWith(v);
                v.addEventListener("loadedmetadata", function () { if (l.positionSeconds > 5 && l.positionSeconds < v.duration - 5) v.currentTime = l.positionSeconds; });
                v.addEventListener("pause", function () { if (!v.ended) save(l, { positionSeconds: Math.floor(v.currentTime) }); });
                v.addEventListener("ended", function () { markDone(l, true); });
                saveTimer = window.setInterval(function () { if (!v.paused) save(l, { positionSeconds: Math.floor(v.currentTime) }); }, 20000);
            }
            player.appendChild(h("div", { class: "ac_row", style: "margin-top:12px" }, [
                h("button", { type: "button", class: "ac_btn b_line", text: l.completed ? "إلغاء علامة الإكمال" : "علّمه كمكتمل", onclick: function () { markDone(l, !l.completed); } })
            ]));
        } catch (e) {
            if (window.console) console.error("lesson open failed", e);
            var errP = h("p", { class: "ac_msg", text: (e && e.message) || "مش قادر أفتح الدرس" });
            if (holder.parentNode) holder.replaceWith(errP); else player.appendChild(errP);
        }
    }

    async function save(l, body) {
        try { var r = await E.call("PUT", "/api/lessons/" + encodeURIComponent(l.id) + "/progress", body); return r.progress; } catch (e) { return null; }
    }
    async function markDone(l, value) {
        var p = await save(l, { completed: value });
        if (!p) { E.toast("ماقدرتش أحفظ التقدّم، جرّب تاني", "bad"); return; }
        l.completed = p.completed;
        if (p.completed) E.toast("برافو! الدرس اتعلّم كمكتمل");
        var b = document.querySelector('.ac_lesson[data-id="' + l.id + '"]');
        if (b) { b.classList.toggle("is_done", l.completed); b.firstChild.textContent = l.completed ? "✓" : (l.kind === "exam" ? "؟" : "▶"); }
    }

    E.requireUser("student").then(function (u) {
        if (!u) return;
        user = u;
        var want = new URLSearchParams(location.search).get("course");
        return showHome().then(function () { if (want && /^[0-9a-f-]{36}$/i.test(want)) return openCourse(want); });
    }).catch(function (e) {
        E.clear(root);
        root.appendChild(h("div", { class: "ac_card" }, [h("p", { class: "ac_msg", text: e.message || "حصل خطأ" })]));
    });
})();
