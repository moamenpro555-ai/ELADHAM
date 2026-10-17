// ================== لوحة المدرس: الامتحانات + السجل ==================
// بيتحمّل بعد teacher.js وبيسجّل تبويبين فيه (الامتحانات والسجل)
(function () {
    "use strict";
    var ui = window.TeacherUI;
    if (!ui) return;
    var E = ui.E, h = E.h, run = ui.run, field = ui.field, option = ui.option;
    var exams = [];
    var filters = { examId: "", stage: "", grade: "", kind: "", month: "", q: "" };

    function body() { return ui.getBody(); }
    function kb(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"; }
    function when(d) { return d ? new Date(d).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" }) : "-"; }

    // ================= قايمة الامتحانات =================
    async function examsView() {
        E.clear(body());
        await run(async function () { exams = (await E.call("GET", "/api/teacher/exams")).exams; });
        var box = h("div", { id: "ex_box" });
        body().appendChild(box);
        listView(box);
    }

    function listView(box) {
        E.clear(box);
        box.appendChild(h("div", { class: "ac_card" }, [
            h("div", { class: "ac_top" }, [
                h("div", null, [h("h2", { class: "ac_h2", text: "الامتحانات" }),
                    h("p", { class: "ac_sub", text: "ارفع ورقة الامتحان (صور أو PDF) واكتب مفتاح الإجابات، والموقع يصحّح للطالب ويسجّل درجته." })]),
                h("button", { type: "button", class: "ac_btn b_dark", text: "امتحان جديد", onclick: function () { editor(box, null); } })
            ])
        ]));
        var card = h("div", { class: "ac_card" });
        if (!exams.length) card.appendChild(h("p", { class: "ac_empty", text: "لسه مفيش امتحانات." }));
        else card.appendChild(h("div", { class: "ac_tablewrap" }, [h("table", { class: "ac_table" }, [
            h("thead", null, [h("tr", null, ["الامتحان", "بيظهر لـ", "الأسئلة", "الملفات", "المحاولات", "الحالة", ""].map(function (t) { return h("th", { text: t }); }))]),
            h("tbody", null, exams.map(function (x) {
                return h("tr", null, [
                    h("td", { text: x.title }),
                    h("td", { text: E.placeLabel(x.stage, x.grade) + " - " + E.examWhen(x) }),
                    h("td", { text: E.num(x.questionCount) }), h("td", { text: E.num(x.fileCount) }), h("td", { text: E.num(x.attemptCount) }),
                    h("td", null, [h("span", { class: "ac_pill " + (x.isPublished ? "p_ok" : ""), text: x.isPublished ? "منشور" : "مخفي" })]),
                    h("td", null, [h("div", { class: "ac_row" }, [
                        h("button", { type: "button", class: "ac_btn b_dark b_sm", text: "تعديل", onclick: function () { editor(box, x.id); } }),
                        h("button", { type: "button", class: "ac_btn b_line b_sm", text: x.isPublished ? "إخفاء" : "نشر", onclick: function () {
                            run(async function () { await E.call("PATCH", "/api/teacher/exams/" + x.id, { isPublished: !x.isPublished }); E.toast(x.isPublished ? "اتخفى الامتحان" : "اتنشر الامتحان"); await examsView(); });
                        } }),
                        h("button", { type: "button", class: "ac_btn b_bad b_sm", text: "حذف", onclick: async function () {
                            if (!(await E.confirmBox("هتمسح الامتحان «" + x.title + "» بملفاته وكل درجات الطلاب فيه. مفيش رجوع. متأكد؟", "احذف الامتحان"))) return;
                            run(async function () { await E.call("DELETE", "/api/teacher/exams/" + x.id); E.toast("اتحذف الامتحان"); await examsView(); });
                        } })
                    ])])
                ]);
            }))
        ])]));
        box.appendChild(card);
    }

    // ================= إنشاء / تعديل امتحان =================
    async function editor(box, id) {
        var d = null;
        if (id) { d = await run(function () { return E.call("GET", "/api/teacher/exams/" + id); }); if (!d) return; }
        var ex = d ? d.exam : null;
        var keyVals = ex ? ex.answerKey.slice() : [];

        var title = h("input", { id: "ex_title", maxlength: "200", value: ex ? ex.title : "" });
        var desc = h("textarea", { id: "ex_desc", maxlength: "2000" }); desc.value = ex ? ex.description : "";
        var stage = ui.placeStage("ex_stage", ex ? ex.stage : "prep");
        var grade = ui.placeGrade("ex_grade", ex ? ex.grade : 1);
        var kind = h("select", { id: "ex_kind" }, [option("session", "امتحان حصة", ex && ex.kind === "session"), option("month", "امتحان شهر", !ex || ex.kind === "month")]);
        var month = h("select", { id: "ex_month" }, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(function (m) { return option(m, E.MONTHS[m], ex && ex.month ? ex.month === m : m === 10); }));
        var qn = h("input", { id: "ex_qn", type: "number", min: "1", max: "100", value: String(ex ? ex.questionCount : 10) });
        var cc = h("select", { id: "ex_cc" }, [2, 3, 4, 5].map(function (n) { return option(n, E.num(n) + " اختيارات (" + E.LETTERS.slice(0, n).join(" ") + ")", (ex ? ex.choicesCount : 4) === n); }));
        var att = h("input", { id: "ex_att", type: "number", min: "0", max: "50", value: String(ex ? ex.maxAttempts : 1) });
        var showAns = h("input", { type: "checkbox", id: "ex_show" }); showAns.checked = ex ? ex.showAnswers : true;
        var pub = h("input", { type: "checkbox", id: "ex_pub" }); pub.checked = ex ? ex.isPublished : false;
        var msg = h("p", { class: "ac_msg", role: "alert" });
        var keyBox = h("div", { class: "ac_key", id: "ex_key" });

        function syncMonth() { month.disabled = kind.value !== "month"; }
        kind.addEventListener("change", syncMonth); syncMonth();

        function buildKey() {
            var n = Math.max(1, Math.min(100, Number(qn.value) || 1)), c = Number(cc.value);
            keyVals.length = n;
            for (var i = 0; i < n; i++) if (keyVals[i] !== undefined && keyVals[i] >= c) keyVals[i] = undefined;
            E.clear(keyBox);
            for (var q = 0; q < n; q++) {
                (function (qi) {
                    var row = h("div", { class: "ac_q" }, [h("span", { class: "ac_qn", text: "س" + E.num(qi + 1) })]);
                    for (var j = 0; j < c; j++) {
                        (function (ji) {
                            var r = h("input", { type: "radio", name: "ex_k" + qi, value: String(ji), "aria-label": "سؤال " + (qi + 1) + " الإجابة " + E.LETTERS[ji] });
                            if (keyVals[qi] === ji) r.checked = true;
                            r.addEventListener("change", function () { keyVals[qi] = ji; });
                            row.appendChild(h("label", { class: "ac_opt" }, [r, h("span", { text: E.LETTERS[ji] })]));
                        })(j);
                    }
                    keyBox.appendChild(row);
                })(q);
            }
        }
        qn.addEventListener("change", buildKey); cc.addEventListener("change", buildKey); buildKey();

        var form = h("form", { class: "ac_form", novalidate: true }, [].concat(
            field("اسم الامتحان", "ex_title", title), field("وصف أو تعليمات (اختياري)", "ex_desc", desc),
            field("المرحلة", "ex_stage", stage), field("الصف", "ex_grade", grade),
            field("النوع", "ex_kind", kind), field("الشهر (لامتحان الشهر)", "ex_month", month),
            field("عدد الأسئلة", "ex_qn", qn), field("عدد الاختيارات لكل سؤال", "ex_cc", cc),
            field("عدد المحاولات المسموحة (0 = بلا حد)", "ex_att", att),
            [h("label", { class: "ac_check" }, [showAns, "اظهر الإجابات الصحيحة للطالب بعد التسليم"]),
                h("label", { class: "ac_check" }, [pub, "منشور (يظهر للطلاب في المرحلة والصف ده)"]),
                h("h3", { class: "ac_h2", text: "مفتاح الإجابات الصحيحة", style: "margin-top:14px" }),
                h("p", { class: "ac_sub", text: "اختار الإجابة الصح لكل سؤال. المفتاح ده على السيرفر ومش بيظهر للطالب قبل ما يسلّم." }),
                keyBox, msg,
                h("div", { class: "ac_row" }, [
                    h("button", { type: "submit", class: "ac_btn b_dark", text: ex ? "حفظ التعديلات" : "حفظ الامتحان" }),
                    h("button", { type: "button", class: "ac_btn b_line", text: "رجوع للقايمة", onclick: function () { examsView(); } })
                ])]));
        form.addEventListener("submit", async function (ev) {
            ev.preventDefault(); msg.textContent = "";
            var n = Number(qn.value);
            if (!title.value.trim()) { msg.textContent = "اكتب اسم الامتحان."; return; }
            if (!Number.isInteger(n) || n < 1 || n > 100) { msg.textContent = "عدد الأسئلة من 1 لـ 100."; return; }
            var missing = [];
            for (var i = 0; i < n; i++) if (keyVals[i] === undefined) missing.push(i + 1);
            if (missing.length) { msg.textContent = "لسه ما حدّدتش الإجابة الصح للأسئلة: " + missing.slice(0, 12).join("، ") + (missing.length > 12 ? " ..." : ""); return; }
            var data = {
                title: title.value.trim(), description: desc.value.trim(), stage: stage.value, grade: Number(grade.value), kind: kind.value,
                questionCount: n, choicesCount: Number(cc.value), maxAttempts: Number(att.value) || 0, showAnswers: showAns.checked,
                isPublished: pub.checked, answerKey: keyVals.slice(0, n)
            };
            if (kind.value === "month") data.month = Number(month.value);
            try {
                if (ex) { await E.call("PATCH", "/api/teacher/exams/" + ex.id, data); E.toast("اتحفظ الامتحان"); await editor(box, ex.id); }
                else { var r = await E.call("POST", "/api/teacher/exams", data); E.toast("اتحفظ الامتحان. ارفع الورقة دلوقتي."); await editor(box, r.exam.id); }
            } catch (e) { msg.textContent = e.message || "حصل خطأ"; }
        });

        E.clear(box);
        box.appendChild(h("div", { class: "ac_card" }, [h("h2", { class: "ac_h2", text: ex ? "تعديل الامتحان" : "امتحان جديد" }), form]));
        if (ex) {
            var up = h("div", { class: "ac_card" });
            box.appendChild(up);
            await renderUploads(up, ex.id);
            if (d.files.length === 0) box.insertBefore(h("div", { class: "ac_banner", text: "الامتحان لسه من غير ورقة. ارفع صور أو PDF الأسئلة من الكارت اللي تحت." }), box.firstChild);
        } else {
            box.appendChild(h("div", { class: "ac_card" }, [h("p", { class: "ac_sub", text: "بعد ما تحفظ الامتحان هتقدر ترفع الصورة التعريفية وورقة الأسئلة (صور أو PDF)." })]));
        }
    }

    // الصورة التعريفية + ملفات الورقة
    async function renderUploads(card, id) {
        var d = await run(function () { return E.call("GET", "/api/teacher/exams/" + id); });
        if (!d) return;
        E.clear(card);
        card.appendChild(h("h2", { class: "ac_h2", text: "الصورة التعريفية" }));
        var coverBox = h("div");
        card.appendChild(coverBox);
        if (d.exam.hasCover) {
            var img = h("img", { class: "ac_thumb", alt: "الصورة التعريفية" });
            E.blobUrl("/api/exams/" + id + "/cover").then(function (u) { img.src = u; }, function () {});
            coverBox.appendChild(img);
            coverBox.appendChild(h("button", { type: "button", class: "ac_btn b_bad b_sm", text: "حذف الصورة", onclick: function () {
                run(async function () { await E.call("DELETE", "/api/teacher/exams/" + id + "/cover"); await renderUploads(card, id); });
            } }));
        }
        var cov = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp", id: "ex_cover", "aria-label": "اختار صورة" });
        card.appendChild(h("div", { class: "ac_form" }, [
            h("label", { for: "ex_cover", text: "ارفع صورة (PNG / JPG / WebP، أقل من 1 ميجا)" }), cov,
            h("button", { type: "button", class: "ac_btn b_gold", text: "رفع الصورة", onclick: function () {
                var f = cov.files[0];
                if (!f) { E.toast("اختار صورة الأول", "bad"); return; }
                if (f.size > 1048576) { E.toast("الصورة أكبر من 1 ميجا", "bad"); return; }
                run(async function () { await E.upload("PUT", "/api/teacher/exams/" + id + "/cover", f); E.toast("اترفعت الصورة"); await renderUploads(card, id); });
            } })
        ]));

        card.appendChild(h("h2", { class: "ac_h2", text: "ورقة الامتحان (" + E.num(d.files.length) + " ملف)", style: "margin-top:22px" }));
        card.appendChild(h("p", { class: "ac_sub", text: "الطالب هيشوف الملفات بنفس الترتيب. الصور (6 ميجا للصورة) أو PDF (8 ميجا). مفيش حد غير الطلاب المسموح لهم يقدر يفتحها." }));
        if (d.files.length) card.appendChild(h("ul", { class: "ac_list", style: "margin:10px 0" }, d.files.map(function (f, i) {
            return h("li", null, [h("div", { class: "ac_lesson", style: "cursor:default;flex-wrap:wrap" }, [
                h("span", { class: "ic", text: E.num(i + 1) }),
                h("span", { style: "flex:1", text: (f.filename || (f.contentType === "application/pdf" ? "ملف PDF" : "صورة")) + " (" + kb(f.size) + ")" }),
                h("button", { type: "button", class: "ac_btn b_line b_sm", text: "معاينة", onclick: async function () {
                    var w = window.open("", "_blank");
                    try { var u = await E.blobUrl("/api/exams/" + id + "/files/" + f.id); if (w) w.location = u; } catch (e) { if (w) w.close(); E.toast("مقدرتش أفتح الملف", "bad"); }
                } }),
                h("button", { type: "button", class: "ac_btn b_bad b_sm", text: "حذف", onclick: async function () {
                    if (!(await E.confirmBox("تمسح الملف ده من الامتحان؟", "احذف الملف"))) return;
                    run(async function () { await E.call("DELETE", "/api/teacher/exams/" + id + "/files/" + f.id); await renderUploads(card, id); });
                } })
            ])]);
        })));
        var files = h("input", { type: "file", multiple: true, id: "ex_files", accept: "image/png,image/jpeg,image/webp,application/pdf" });
        var go = h("button", { type: "button", class: "ac_btn b_gold", text: "رفع الملفات" });
        go.addEventListener("click", async function () {
            var list = Array.prototype.slice.call(files.files);
            if (!list.length) { E.toast("اختار ملفات الأول", "bad"); return; }
            go.disabled = true;
            var ok = 0;
            for (var i = 0; i < list.length; i++) {
                var f = list[i];
                var isPdf = /\.pdf$/i.test(f.name) || f.type === "application/pdf";
                if (f.size > (isPdf ? 8 : 6) * 1048576) { E.toast("«" + f.name + "» أكبر من الحد المسموح", "bad"); continue; }
                try { await E.upload("POST", "/api/teacher/exams/" + id + "/files?name=" + encodeURIComponent(f.name), f); ok++; }
                catch (e) { E.toast("«" + f.name + "»: " + (e.message || "فشل الرفع"), "bad"); }
            }
            if (ok) E.toast("اترفع " + E.num(ok) + " ملف");
            await renderUploads(card, id);
        });
        card.appendChild(h("div", { class: "ac_form" }, [h("label", { for: "ex_files", text: "اختار صور أو PDF (تقدر تختار كذا ملف مرة واحدة، بالترتيب)" }), files, go]));
    }

    // ================= السجل =================
    async function resultsView() {
        E.clear(body());
        if (!exams.length) await run(async function () { exams = (await E.call("GET", "/api/teacher/exams")).exams; });
        var exSel = h("select", { id: "rs_ex", "aria-label": "الامتحان" }, [option("", "كل الامتحانات", !filters.examId)].concat(exams.map(function (x) { return option(x.id, x.title + " - " + E.placeLabel(x.stage, x.grade), x.id === filters.examId); })));
        var st = h("select", { id: "rs_st", "aria-label": "المرحلة" }, [option("", "كل المراحل", !filters.stage), option("prep", "إعدادي", filters.stage === "prep"), option("secondary", "ثانوي", filters.stage === "secondary")]);
        var gr = h("select", { id: "rs_gr", "aria-label": "الصف" }, [option("", "كل الصفوف", !filters.grade)].concat([1, 2, 3].map(function (g) { return option(g, "الصف " + E.GRADES[g], String(g) === filters.grade); })));
        var kd = h("select", { id: "rs_kd", "aria-label": "النوع" }, [option("", "حصة وشهر", !filters.kind), option("session", "امتحانات الحصة", filters.kind === "session"), option("month", "امتحانات الشهر", filters.kind === "month")]);
        var mo = h("select", { id: "rs_mo", "aria-label": "الشهر" }, [option("", "كل الشهور", !filters.month)].concat([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(function (m) { return option(m, E.MONTHS[m], String(m) === filters.month); })));
        var q = h("input", { class: "ac_in", type: "search", placeholder: "اسم الطالب أو إيميله", value: filters.q, "aria-label": "بحث" });
        var out = h("div");
        function apply() {
            filters = { examId: exSel.value, stage: st.value, grade: gr.value, kind: kd.value, month: mo.value, q: q.value.trim() };
            load(out);
        }
        [exSel, st, gr, kd, mo].forEach(function (c) { c.addEventListener("change", apply); });
        var timer = 0; q.addEventListener("input", function () { window.clearTimeout(timer); timer = window.setTimeout(apply, 400); });
        body().appendChild(h("div", { class: "ac_card" }, [h("h2", { class: "ac_h2", text: "سجل الدرجات" }), h("div", { class: "ac_filters" }, [exSel, st, gr, kd, mo, q])]));
        body().appendChild(out);
        await load(out);
    }

    async function load(out) {
        var qs = Object.keys(filters).filter(function (k) { return filters[k]; }).map(function (k) { return k + "=" + encodeURIComponent(filters[k]); });
        qs.push("limit=500");
        var d = await run(function () { return E.call("GET", "/api/teacher/results?" + qs.join("&")); });
        if (!d) return;
        E.clear(out);
        var card = h("div", { class: "ac_card" });
        out.appendChild(card);
        card.appendChild(h("div", { class: "ac_top" }, [
            h("div", { class: "ac_stat" }, [h("span", { text: "عدد المحاولات: " + E.num(d.total) }), h("span", { text: "المتوسط: " + E.num(d.averagePercent) + "٪" })]),
            d.results.length ? h("button", { type: "button", class: "ac_btn b_line", text: "تحميل Excel (CSV)", onclick: function () { exportCsv(d.results); } }) : null
        ]));
        if (!d.results.length) { card.appendChild(h("p", { class: "ac_empty", text: "مفيش درجات مسجّلة بالفلاتر دي." })); return; }
        if (d.total > d.results.length) card.appendChild(h("p", { class: "ac_sub", text: "معروض أحدث " + E.num(d.results.length) + " محاولة. استخدم الفلاتر لتضييق النتايج." }));
        card.appendChild(h("div", { class: "ac_tablewrap" }, [h("table", { class: "ac_table" }, [
            h("thead", null, [h("tr", null, ["الطالب", "الصف", "الامتحان", "المحاولة", "الدرجة", "الأسئلة الغلط", "التاريخ", ""].map(function (t) { return h("th", { text: t }); }))]),
            h("tbody", null, d.results.map(function (r) {
                var pill = r.percent >= 85 ? "p_ok" : (r.percent < 50 ? "p_bad" : "");
                return h("tr", null, [
                    h("td", null, [h("div", { text: r.studentName }), h("div", { class: "ac_sub", dir: "ltr", text: r.studentEmail })]),
                    h("td", { text: E.placeLabel(r.stage, r.grade) }),
                    h("td", null, [h("div", { text: r.examTitle }), h("div", { class: "ac_sub", text: E.examWhen(r) })]),
                    h("td", { text: E.num(r.attemptNo) }),
                    h("td", null, [h("span", { class: "ac_pill " + pill, text: E.num(r.score) + " / " + E.num(r.total) + " (" + E.num(r.percent) + "٪)" })]),
                    h("td", { text: r.wrong.length ? r.wrong.slice(0, 10).map(function (n) { return E.num(n); }).join("، ") + (r.wrong.length > 10 ? " ..." : "") : "-" }),
                    h("td", { text: when(r.createdAt) }),
                    h("td", null, [h("button", { type: "button", class: "ac_btn b_bad b_sm", text: "حذف المحاولة", onclick: async function () {
                        if (!(await E.confirmBox("تمسح محاولة " + r.studentName + " في «" + r.examTitle + "»؟ الطالب هيقدر يحلّه تاني لو المحاولات محدودة.", "احذف المحاولة"))) return;
                        run(async function () { await E.call("DELETE", "/api/teacher/results/" + r.id); E.toast("اتحذفت المحاولة"); await load(out); });
                    } })])
                ]);
            }))
        ])]));
    }

    // CSV: الخلايا اللي بتبدأ بـ = + - @ بنحط قبلها ' عشان Excel ما يفسّرهاش كمعادلة
    function csvCell(v) {
        var s = String(v === null || v === undefined ? "" : v);
        if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
        return '"' + s.replace(/"/g, '""') + '"';
    }
    function exportCsv(rows) {
        var head = ["الطالب", "الإيميل", "المرحلة والصف", "الامتحان", "النوع", "المحاولة", "الدرجة", "من", "النسبة", "الأسئلة الغلط", "التاريخ"];
        var lines = [head.map(csvCell).join(",")].concat(rows.map(function (r) {
            return [r.studentName, r.studentEmail, E.placeLabel(r.stage, r.grade), r.examTitle, E.examWhen(r), r.attemptNo, r.score, r.total, r.percent + "%", r.wrong.join(" "), new Date(r.createdAt).toISOString().slice(0, 16).replace("T", " ")].map(csvCell).join(",");
        }));
        var blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob); a.download = "eladham-results.csv";
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    }

    ui.views.exams = examsView;
    ui.views.results = resultsView;
})();
