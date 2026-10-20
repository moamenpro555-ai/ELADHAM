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
        var failed = "";
        try { exams = (await E.call("GET", "/api/teacher/exams")).exams; }
        catch (e) { failed = (e && e.message ? e.message : "حصل خطأ") + (e && e.status ? " (" + e.status + ")" : ""); exams = []; }
        var box = h("div", { id: "ex_box" });
        body().appendChild(box);
        if (failed) {
            box.appendChild(h("div", { class: "ac_card" }, [
                h("p", { class: "ac_msg", role: "alert", text: "ما قدرتش أجيب قايمة الامتحانات: " + failed }),
                h("button", { type: "button", class: "ac_btn b_dark", text: "حاول تاني", onclick: function () { examsView(); } })
            ]));
            return;
        }
        listView(box);
    }

    function listView(box) {
        E.clear(box);
        box.appendChild(h("div", { class: "ac_card" }, [
            h("div", { class: "ac_top" }, [
                h("div", null, [h("h2", { class: "ac_h2", text: "الامتحانات" }),
                    h("p", { class: "ac_sub", text: "اكتب الأسئلة والإجابات هنا وتظهر للطالب بنفس شكل امتحان الحصة (في امتحانات الحصة أو الشهر). أو ارفع ورقة (صور أو PDF) واكتب مفتاح الإجابات وتظهر في قسم «واجب» للمرحلة والصف اللي تحدده." })]),
                h("div", { class: "ac_row" }, [
                    h("button", { type: "button", class: "ac_btn b_dark", id: "ex_new_typed", text: "امتحان جديد (أكتب الأسئلة)", onclick: function () { typedEditor(box, null); } }),
                    h("button", { type: "button", class: "ac_btn b_line", id: "ex_new_paper", text: "واجب بورقة مرفوعة", onclick: function () { editor(box, null); } })
                ])
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
                        h("button", { type: "button", class: "ac_btn b_dark b_sm", text: "تعديل", onclick: function () { if (x.typed) typedEditor(box, x.id); else editor(box, x.id); } }),
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
        var qn = h("input", { id: "ex_qn", type: "number", min: "1", max: "100", value: String(ex ? ex.questionCount : 10) });
        var cc = h("select", { id: "ex_cc" }, [2, 3, 4, 5].map(function (n) { return option(n, E.num(n) + " اختيارات (" + E.LETTERS.slice(0, n).join(" ") + ")", (ex ? ex.choicesCount : 4) === n); }));
        var att = h("input", { id: "ex_att", type: "number", min: "0", max: "50", value: String(ex ? ex.maxAttempts : 1) });
        var showAns = h("input", { type: "checkbox", id: "ex_show" }); showAns.checked = ex ? ex.showAnswers : true;
        var pub = h("input", { type: "checkbox", id: "ex_pub" }); pub.checked = ex ? ex.isPublished : false;
        var msg = h("p", { class: "ac_msg", role: "alert" });
        var keyBox = h("div", { class: "ac_key", id: "ex_key" });

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
                title: title.value.trim(), description: desc.value.trim(), stage: stage.value, grade: Number(grade.value),
                questionCount: n, choicesCount: Number(cc.value), maxAttempts: Number(att.value) || 0, showAnswers: showAns.checked,
                isPublished: pub.checked, answerKey: keyVals.slice(0, n)
            };
            try {
                if (ex) { await E.call("PATCH", "/api/teacher/exams/" + ex.id, data); E.toast("اتحفظ الواجب"); await editor(box, ex.id); }
                else { var r = await E.call("POST", "/api/teacher/exams", data); E.toast("اتحفظ الواجب. ارفع الورقة دلوقتي."); await editor(box, r.exam.id); }
            } catch (e) {
                msg.textContent = "ما اتحفظش الامتحان: " + (e && e.message ? e.message : "حصل خطأ") + (e && e.status ? " (" + e.status + ")" : "");
                E.toast(msg.textContent, "bad");
                msg.scrollIntoView({ block: "center" });
            }
        });

        E.clear(box);
        box.appendChild(h("div", { class: "ac_card" }, [h("h2", { class: "ac_h2", text: ex ? "تعديل الواجب" : "واجب جديد (ورقة مرفوعة)" }), form]));
        if (ex) {
            var up = h("div", { class: "ac_card" });
            box.appendChild(up);
            await renderUploads(up, ex.id);
            if (d.files.length === 0) box.insertBefore(h("div", { class: "ac_banner", text: "الامتحان لسه من غير ورقة. ارفع صور أو PDF الأسئلة من الكارت اللي تحت." }), box.firstChild);
        } else {
            box.appendChild(h("div", { class: "ac_card" }, [h("p", { class: "ac_sub", text: "بعد ما تحفظ الامتحان هتقدر ترفع الصورة التعريفية وورقة الأسئلة (صور أو PDF)." })]));
        }
    }


    // ================= امتحان بأسئلة مكتوبة =================
    var HELP = "اكتب كل سؤال وتحته اختياراته، وعلّم الإجابة الصح بنجمة * في آخر الاختيار (أو سطر «الإجابة: ب»). الشرح اختياري بسطر «شرح: ...». عنوان الجزء بسطر يبدأ بـ #.\n\n# الجزء الأول: كان وأخواتها\n1- كانَ الطالبُ .... في دراسته.\nأ) مجتهدٌ\nب) مجتهدًا *\nج) مجتهدٍ\nد) مجتهدون\nشرح: «مجتهدًا» خبر كان منصوب.";
    var LET_IDX = { "أ": 0, "ا": 0, "ب": 1, "ج": 2, "د": 3, "ه": 4, "هـ": 4, "a": 0, "b": 1, "c": 2, "d": 3, "e": 4 };
    var OPT_RE = /^\s*(\*|✓|✔)?\s*(هـ|[أابجدهa-eA-E])\s*[\)\-\.\:\]]\s*(.*?)\s*(\*|✓|✔)?\s*$/;
    var WHY_RE = /^\s*(?:ال)?شرح\s*[:：]\s*(.*)$/;
    var ANS_RE = /^\s*(?:ال)?إجابة(?:\s+(?:الصح|الصحيحة))?\s*[:：]\s*(هـ|[أابجدهa-eA-E])/;
    function parseQuestions(text) {
        var out = [], section = "", cur = null, inWhy = false;
        function flush() { if (cur && (cur.q || cur.options.length)) out.push(cur); cur = null; inWhy = false; }
        text.replace(/\r/g, "").split("\n").forEach(function (raw) {
            var line = raw.trim();
            if (!line) return;
            if (line.charAt(0) === "#") { flush(); section = line.replace(/^#+\s*/, "").trim(); return; }
            var m;
            if (cur && (m = line.match(WHY_RE))) { cur.why = m[1].trim(); inWhy = true; return; }
            if (cur && (m = line.match(ANS_RE))) { var ix = LET_IDX[m[1].toLowerCase()]; if (ix !== undefined) cur.answer = ix; return; }
            if (cur && !inWhy && (m = line.match(OPT_RE)) && (m[3] || "").length) {
                cur.options.push(m[3]);
                if (m[1] || m[4]) cur.answer = cur.options.length - 1;
                return;
            }
            if (cur && cur.options.length === 0) { cur.q += " " + line; return; }
            flush();
            cur = { section: section, q: line.replace(/^\s*[0-9٠-٩]+\s*[\)\-\.\:]\s*/, ""), options: [], answer: -1, why: "" };
        });
        flush();
        return out;
    }

    async function typedEditor(box, id) {
        var d = null;
        if (id) { d = await run(function () { return E.call("GET", "/api/teacher/exams/" + id); }); if (!d) return; }
        var ex = d ? d.exam : null;
        var qs = ex && ex.questions ? ex.questions.map(function (q) { return { section: q.section || "", q: q.q, options: q.options.slice(), answer: q.answer, why: q.why || "" }; }) : [];

        var title = h("input", { id: "ex_title", maxlength: "200", value: ex ? ex.title : "" });
        var desc = h("textarea", { id: "ex_desc", maxlength: "2000" }); desc.value = ex ? ex.description : "";
        var stage = ui.placeStage("ex_stage", ex ? ex.stage : "secondary");
        var grade = ui.placeGrade("ex_grade", ex ? ex.grade : 1);
        var kind = h("select", { id: "ex_kind" }, [option("session", "امتحان حصة", !ex || ex.kind === "session"), option("month", "امتحان شهر", ex && ex.kind === "month")]);
        var month = h("select", { id: "ex_month" }, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(function (m) { return option(m, E.MONTHS[m], ex && ex.month ? ex.month === m : m === 10); }));
        var sno = h("input", { id: "ex_sno", type: "number", min: "1", max: "30", value: String(ex && ex.sessionNo ? ex.sessionNo : 1) });
        var att = h("input", { id: "ex_att", type: "number", min: "0", max: "50", value: String(ex ? ex.maxAttempts : 1) });
        var showAns = h("input", { type: "checkbox", id: "ex_show" }); showAns.checked = ex ? ex.showAnswers : true;
        var pub = h("input", { type: "checkbox", id: "ex_pub" }); pub.checked = ex ? ex.isPublished : false;
        var msg = h("p", { class: "ac_msg", role: "alert" });
        var list = h("div", { id: "tq_list" });
        var count = h("p", { class: "ac_sub", id: "tq_count" });
        function syncKind() { month.disabled = kind.value !== "month"; sno.disabled = kind.value !== "session"; }
        kind.addEventListener("change", syncKind); syncKind();

        function blank() { return { section: qs.length ? qs[qs.length - 1].section : "", q: "", options: ["", "", "", ""], answer: -1, why: "" }; }
        function renderList() {
            E.clear(list);
            count.textContent = E.num(qs.length) + " سؤال";
            qs.forEach(function (q, qi) {
                var sec = h("input", { class: "ac_in", placeholder: "عنوان الجزء (اختياري) مثل: الجزء الأول: كان وأخواتها", value: q.section, maxlength: "200", "aria-label": "عنوان الجزء" });
                sec.addEventListener("input", function () { q.section = sec.value; });
                var qt = h("textarea", { class: "tq_q", placeholder: "نص السؤال", maxlength: "1500", "aria-label": "نص السؤال " + (qi + 1) }); qt.value = q.q;
                qt.addEventListener("input", function () { q.q = qt.value; });
                var opts = h("div", { class: "tq_opts" });
                q.options.forEach(function (o, oi) {
                    var r = h("input", { type: "radio", name: "tq_a" + qi, "aria-label": "الإجابة الصح هي " + E.LETTERS[oi] }); r.checked = q.answer === oi;
                    r.addEventListener("change", function () { q.answer = oi; });
                    var t = h("input", { class: "ac_in", placeholder: "الاختيار " + E.LETTERS[oi], value: o, maxlength: "500", "aria-label": "الاختيار " + E.LETTERS[oi] + " للسؤال " + (qi + 1) });
                    t.addEventListener("input", function () { q.options[oi] = t.value; });
                    var del = h("button", { type: "button", class: "ac_btn b_line b_sm", text: "×", "aria-label": "احذف الاختيار", onclick: function () {
                        if (q.options.length <= 2) { E.toast("لازم اختيارين على الأقل", "bad"); return; }
                        q.options.splice(oi, 1); if (q.answer === oi) q.answer = -1; else if (q.answer > oi) q.answer--; renderList();
                    } });
                    opts.appendChild(h("div", { class: "tq_opt" }, [h("label", { class: "tq_ok", title: "الإجابة الصح" }, [r, h("span", { text: E.LETTERS[oi] })]), t, del]));
                });
                var why = h("input", { class: "ac_in", placeholder: "شرح الإجابة (اختياري - بيظهر للطالب بعد التسليم)", value: q.why, maxlength: "1500", "aria-label": "شرح" });
                why.addEventListener("input", function () { q.why = why.value; });
                function move(dir) { var j = qi + dir; if (j < 0 || j >= qs.length) return; var t = qs[qi]; qs[qi] = qs[j]; qs[j] = t; renderList(); }
                list.appendChild(h("div", { class: "tq_card" }, [
                    h("div", { class: "ac_top" }, [h("b", { text: "سؤال " + E.num(qi + 1) }), h("div", { class: "ac_row" }, [
                        h("button", { type: "button", class: "ac_btn b_line b_sm", text: "↑", "aria-label": "فوق", onclick: function () { move(-1); } }),
                        h("button", { type: "button", class: "ac_btn b_line b_sm", text: "↓", "aria-label": "تحت", onclick: function () { move(1); } }),
                        h("button", { type: "button", class: "ac_btn b_bad b_sm", text: "حذف", onclick: function () { qs.splice(qi, 1); renderList(); } })
                    ])]),
                    sec, qt, opts,
                    h("div", { class: "ac_row" }, [q.options.length < 5 ? h("button", { type: "button", class: "ac_btn b_line b_sm", text: "+ اختيار", onclick: function () { q.options.push(""); renderList(); } }) : null,
                        h("span", { class: "ac_sub", text: "علّم الدايرة جنب الإجابة الصح" })]),
                    why
                ]));
            });
        }
        renderList();

        var paste = h("textarea", { id: "tq_paste", class: "tq_paste", placeholder: HELP, rows: "8" });
        var pmsg = h("p", { class: "ac_msg", role: "status" });
        var importBox = h("div", { class: "tq_import" }, [
            h("h3", { class: "ac_h2", text: "الصق الأسئلة دفعة واحدة (أسهل)" }),
            h("p", { class: "ac_sub", text: "انسخ الأسئلة من ملف Word أو أي مكان والصقها هنا بالشكل اللي تحت، وهتتحوّل لأسئلة تقدر تراجعها." }),
            paste, pmsg,
            h("div", { class: "ac_row" }, [h("button", { type: "button", class: "ac_btn b_gold", id: "tq_parse", text: "حوّل لأسئلة", onclick: function () {
                var got = parseQuestions(paste.value);
                if (!got.length) { pmsg.textContent = "ما لقيتش أسئلة. اتأكد من الشكل (سؤال ثم اختيارات أ) ب) ج) د))."; return; }
                var noAns = got.filter(function (q) { return q.answer < 0; }).length, few = got.filter(function (q) { return q.options.length < 2; }).length;
                got.forEach(function (q) { qs.push(q); });
                paste.value = ""; renderList();
                pmsg.textContent = "اتضاف " + E.num(got.length) + " سؤال." + (noAns ? " " + E.num(noAns) + " سؤال محتاج تحدد إجابته الصح." : "") + (few ? " " + E.num(few) + " سؤال اختياراته أقل من اتنين." : "");
            } })])
        ]);

        var form = h("form", { class: "ac_form", novalidate: true }, [].concat(
            field("اسم الامتحان", "ex_title", title), field("وصف أو تعليمات (بيظهر تحت العنوان)", "ex_desc", desc),
            field("المرحلة", "ex_stage", stage), field("الصف", "ex_grade", grade),
            field("النوع", "ex_kind", kind), field("الشهر (لامتحان الشهر)", "ex_month", month), field("رقم الحصة (1 = الأولى، 2 = التانية ...)", "ex_sno", sno),
            field("عدد المحاولات المسموحة (0 = بلا حد)", "ex_att", att),
            [h("label", { class: "ac_check" }, [showAns, "اظهر الإجابات الصحيحة والشرح للطالب بعد التسليم"]),
                h("label", { class: "ac_check" }, [pub, "منشور (يظهر للطلاب في المرحلة والصف ده)"])]));
        var saveMsg = msg;
        var save = h("button", { type: "button", class: "ac_btn b_dark", id: "tq_save", text: ex ? "حفظ التعديلات" : "حفظ الامتحان" });
        save.addEventListener("click", async function () {
            saveMsg.textContent = "";
            if (!title.value.trim()) { saveMsg.textContent = "اكتب اسم الامتحان."; return; }
            if (!qs.length) { saveMsg.textContent = "ضيف سؤال واحد على الأقل."; return; }
            for (var i = 0; i < qs.length; i++) {
                var q = qs[i];
                if (!q.q.trim()) { saveMsg.textContent = "السؤال " + E.num(i + 1) + ": اكتب نص السؤال."; return; }
                if (q.options.some(function (o) { return !o.trim(); })) { saveMsg.textContent = "السؤال " + E.num(i + 1) + ": في اختيار فاضي (املاه أو احذفه)."; return; }
                if (q.answer < 0 || q.answer >= q.options.length) { saveMsg.textContent = "السؤال " + E.num(i + 1) + ": حدّد الإجابة الصح."; return; }
            }
            var data = {
                title: title.value.trim(), description: desc.value.trim(), stage: stage.value, grade: Number(grade.value), kind: kind.value,
                maxAttempts: Number(att.value) || 0, showAnswers: showAns.checked, isPublished: pub.checked,
                questions: qs.map(function (q) { return { section: q.section.trim(), q: q.q.trim(), options: q.options.map(function (o) { return o.trim(); }), answer: q.answer, why: q.why.trim() }; })
            };
            if (kind.value === "month") data.month = Number(month.value);
            else { data.sessionNo = Number(sno.value); if (!Number.isInteger(data.sessionNo) || data.sessionNo < 1 || data.sessionNo > 30) { saveMsg.textContent = "رقم الحصة من 1 لـ 30."; return; } }
            save.disabled = true;
            try {
                if (ex) { await E.call("PATCH", "/api/teacher/exams/" + ex.id, data); E.toast("اتحفظ الامتحان"); await typedEditor(box, ex.id); }
                else { var r = await E.call("POST", "/api/teacher/exams", data); E.toast("اتحفظ الامتحان"); await typedEditor(box, r.exam.id); }
            } catch (e) {
                saveMsg.textContent = "ما اتحفظش الامتحان: " + (e && e.message ? e.message : "حصل خطأ");
                E.toast(saveMsg.textContent, "bad");
                save.disabled = false;
            }
        });

        E.clear(box);
        box.appendChild(h("div", { class: "ac_card" }, [h("h2", { class: "ac_h2", text: ex ? "تعديل الامتحان" : "امتحان جديد (أكتب الأسئلة)" }), form]));
        box.appendChild(h("div", { class: "ac_card" }, [importBox]));
        box.appendChild(h("div", { class: "ac_card" }, [h("div", { class: "ac_top" }, [h("h2", { class: "ac_h2", text: "الأسئلة" }), count]), list,
            h("div", { class: "ac_row", style: "margin-top:12px" }, [h("button", { type: "button", class: "ac_btn b_gold", id: "tq_add", text: "+ سؤال جديد", onclick: function () { qs.push(blank()); renderList(); var c = list.lastChild; if (c) c.scrollIntoView({ block: "center" }); } })]),
            saveMsg,
            h("div", { class: "ac_row" }, [save, h("button", { type: "button", class: "ac_btn b_line", text: "رجوع للقايمة", onclick: function () { examsView(); } })])]));
        if (ex) { var up = h("div", { class: "ac_card" }); box.appendChild(up); await renderUploads(up, ex.id, true); }
        else box.appendChild(h("div", { class: "ac_card" }, [h("p", { class: "ac_sub", text: "بعد الحفظ تقدر ترفع صورة تعريفية للامتحان." })]));
    }

    // الصورة التعريفية + ملفات الورقة
    async function renderUploads(card, id, coverOnly) {
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
                run(async function () { await E.call("DELETE", "/api/teacher/exams/" + id + "/cover"); await renderUploads(card, id, coverOnly); });
            } }));
        }
        var cov = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp", id: "ex_cover", "aria-label": "اختار صورة" });
        card.appendChild(h("div", { class: "ac_form" }, [
            h("label", { for: "ex_cover", text: "ارفع صورة (PNG / JPG / WebP، أقل من 1 ميجا)" }), cov,
            h("button", { type: "button", class: "ac_btn b_gold", text: "رفع الصورة", onclick: function () {
                var f = cov.files[0];
                if (!f) { E.toast("اختار صورة الأول", "bad"); return; }
                if (f.size > 1048576) { E.toast("الصورة أكبر من 1 ميجا", "bad"); return; }
                run(async function () { await E.upload("PUT", "/api/teacher/exams/" + id + "/cover", f); E.toast("اترفعت الصورة"); await renderUploads(card, id, coverOnly); });
            } })
        ]));

        if (coverOnly) return;
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
        var kd = h("select", { id: "rs_kd", "aria-label": "النوع" }, [option("", "كل الأنواع", !filters.kind), option("session", "امتحانات الحصة", filters.kind === "session"), option("month", "امتحانات الشهر", filters.kind === "month"), option("homework", "واجب", filters.kind === "homework")]);
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
