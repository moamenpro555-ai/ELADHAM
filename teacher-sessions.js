// ================== لوحة المدرس: الحصص (فيديوهات عادي، مش كورسات) ==================
// بيتحمّل بعد teacher.js. كل حصة ليها زرار نشر/إخفاء لوحده.
(function () {
    "use strict";
    var ui = window.TeacherUI;
    if (!ui) return;
    var E = ui.E, h = E.h, run = ui.run, field = ui.field;
    var items = [];

    function body() { return ui.getBody(); }

    async function sessionsView() {
        E.clear(body());
        await run(async function () { items = (await E.call("GET", "/api/teacher/sessions")).sessions; });
        body().appendChild(form(null));
        var card = h("div", { class: "ac_card" }, [h("h2", { class: "ac_h2", text: "الحصص (" + E.num(items.length) + ")" }),
            h("p", { class: "ac_sub", text: "كل حصة فيديو لوحده بيظهر في قسم «حصص» للمرحلة والصف اللي تحدده. تتحكم في نشر كل حصة لوحدها." })]);
        if (!items.length) card.appendChild(h("p", { class: "ac_empty", text: "لسه مفيش حصص. ضيف أول حصة من النموذج اللي فوق." }));
        else card.appendChild(h("div", { class: "ac_tablewrap" }, [h("table", { class: "ac_table", style: "min-width:760px" }, [
            h("thead", null, [h("tr", null, ["الترتيب", "الحصة", "بتظهر لـ", "الحالة", ""].map(function (t) { return h("th", { text: t }); }))]),
            h("tbody", null, items.map(row))
        ])]));
        body().appendChild(card);
    }

    function row(s) {
        return h("tr", { "data-session": s.id }, [
            h("td", { text: E.num(s.position) }), h("td", { text: s.title }),
            h("td", { text: E.placeLabel(s.stage, s.grade) }),
            h("td", null, [h("span", { class: "ac_pill " + (s.isPublished ? "p_ok" : ""), text: s.isPublished ? "منشورة" : "مخفية" })]),
            h("td", null, [h("div", { class: "ac_row" }, [
                h("button", { type: "button", class: "ac_btn b_line b_sm", text: s.isPublished ? "إخفاء" : "نشر", onclick: function () {
                    run(async function () { await E.call("PATCH", "/api/teacher/sessions/" + s.id, { isPublished: !s.isPublished }); E.toast(s.isPublished ? "اتخفت الحصة" : "اتنشرت الحصة"); await sessionsView(); });
                } }),
                h("button", { type: "button", class: "ac_btn b_dark b_sm", text: "تعديل", onclick: function () { E.clear(body()); body().appendChild(form(s)); window.scrollTo({ top: 0 }); } }),
                h("button", { type: "button", class: "ac_btn b_bad b_sm", text: "حذف", onclick: async function () {
                    if (!(await E.confirmBox("تمسح الحصة «" + s.title + "»؟", "احذف"))) return;
                    run(async function () { await E.call("DELETE", "/api/teacher/sessions/" + s.id); E.toast("اتحذفت الحصة"); await sessionsView(); });
                } })
            ])])
        ]);
    }

    function form(s) {
        var title = h("input", { id: "sv_title", maxlength: "200", value: s ? s.title : "" });
        var desc = h("textarea", { id: "sv_desc", maxlength: "2000" }); desc.value = s ? s.description : "";
        var url = h("input", { id: "sv_url", dir: "ltr", maxlength: "1000", placeholder: "https://youtu.be/...", value: s ? s.videoRef : "" });
        var stage = ui.placeStage("sv_stage", s ? s.stage : "secondary");
        var grade = ui.placeGrade("sv_grade", s ? s.grade : 1);
        var pos = h("input", { id: "sv_pos", type: "number", min: "0", max: "100000", value: String(s ? s.position : 0) });
        var pub = h("input", { type: "checkbox", id: "sv_pub" }); pub.checked = s ? s.isPublished : false;
        var msg = h("p", { class: "ac_msg", role: "alert" });
        var f = h("form", { class: "ac_form", novalidate: true }, [].concat(
            field("اسم الحصة", "sv_title", title), field("وصف مختصر (اختياري)", "sv_desc", desc),
            field("رابط الفيديو (يوتيوب أو غيره)", "sv_url", url),
            field("المرحلة", "sv_stage", stage), field("الصف", "sv_grade", grade),
            field("الترتيب (الأصغر الأول)", "sv_pos", pos),
            [h("label", { class: "ac_check" }, [pub, "منشورة (تظهر للطلاب)"]), msg,
                h("div", { class: "ac_row" }, [h("button", { type: "submit", class: "ac_btn b_dark", id: "sv_save", text: s ? "حفظ التعديلات" : "إضافة الحصة" }),
                    s ? h("button", { type: "button", class: "ac_btn b_line", text: "إلغاء", onclick: function () { sessionsView(); } }) : null])]));
        f.addEventListener("submit", async function (ev) {
            ev.preventDefault(); msg.textContent = "";
            if (!title.value.trim()) { msg.textContent = "اكتب اسم الحصة."; return; }
            if (!/^https?:\/\//i.test(url.value.trim())) { msg.textContent = "الصق رابط الفيديو (بيبدأ بـ https://)."; return; }
            var data = { title: title.value.trim(), description: desc.value.trim(), videoRef: url.value.trim(), stage: stage.value, grade: Number(grade.value), position: Number(pos.value) || 0, isPublished: pub.checked };
            try {
                if (s) await E.call("PATCH", "/api/teacher/sessions/" + s.id, data); else await E.call("POST", "/api/teacher/sessions", data);
                E.toast(s ? "اتحفظت الحصة" : "اتضافت الحصة");
                await sessionsView();
            } catch (e) { msg.textContent = e.message || "حصل خطأ"; }
        });
        return h("div", { class: "ac_card" }, [h("h2", { class: "ac_h2", text: s ? "تعديل الحصة" : "حصة جديدة" }), f]);
    }

    ui.views.sessions = sessionsView;
})();
