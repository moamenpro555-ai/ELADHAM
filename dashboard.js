// ================== لوحة الطالب ==================
(function () {
    "use strict";
    var E = window.Eladham, h = E.h;
    var root = document.getElementById("ac_root");
    var user = null;
    var current = null;      // { course, lessons }
    var activeLesson = null;
    var saveTimer = 0;

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
            if (others.length) {
                var more = h("div", { class: "ac_card" }, [h("h2", { class: "ac_h2", text: "كورسات تانية متاحة" }),
                    h("p", { class: "ac_sub", text: "كلّم المدرس لو عايز تشترك فيها." }),
                    h("div", { class: "ac_grid" }, others.map(courseCard))]);
                root.appendChild(more);
            }
        } catch (e) { E.clear(box); box.appendChild(h("p", { class: "ac_msg", text: e.message })); }
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
        } catch (e) { holder.replaceWith(h("p", { class: "ac_msg", text: e.message || "مش قادر أفتح الدرس" })); }
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
        return showHome();
    }).catch(function (e) {
        E.clear(root);
        root.appendChild(h("div", { class: "ac_card" }, [h("p", { class: "ac_msg", text: e.message || "حصل خطأ" })]));
    });
})();
