// ================== لوحة المدرس ==================
(function () {
    "use strict";
    var E = window.Eladham, h = E.h;
    var root = document.getElementById("ac_root");
    var user = null;
    var tab = "courses";
    var courses = [];
    var students = [];
    var body; // مكان محتوى التبويب

    // بينفّذ عملية ويظهر أي خطأ كرسالة
    async function run(fn) {
        try { return await fn(); } catch (e) { E.toast(e.message || "حصل خطأ", "bad"); return undefined; }
    }
    var ui = window.TeacherUI = { run: run, views: {}, E: E, courseCards: [], pendingSales: 0 };
    function field(label, id, control) { return [h("label", { for: id, text: label }), control]; }
    function option(value, text, sel) { return h("option", { value: String(value), text: text, selected: sel ? true : false }); }
    function stageSelect(id, val) { return h("select", { id: id }, Object.keys(E.STAGES).map(function (k) { return option(k, E.STAGES[k], k === val); })); }
    function gradeSelect(id, val) { return h("select", { id: id }, [1, 2, 3, 4, 5, 6].map(function (g) { return option(g, "الصف " + E.GRADES[g], g === val); })); }
    function fmtDate(s) { return s ? new Date(s).toLocaleDateString("ar-EG") : "-"; }
    // المرحلة والصف للامتحانات والطلاب: إعدادي وثانوي، من أولى لتالتة
    function placeStage(id, val, blank) {
        var opts = blank ? [option("", "المرحلة؟", !val)] : [];
        return h("select", { id: id }, opts.concat(["prep", "secondary"].map(function (k) { return option(k, E.STAGES[k], k === val); })));
    }
    function placeGrade(id, val, blank) {
        var opts = blank ? [option("", "الصف؟", !val)] : [];
        return h("select", { id: id }, opts.concat([1, 2, 3].map(function (g) { return option(g, "الصف " + E.GRADES[g], g === val); })));
    }
    ui.field = field; ui.option = option; ui.fmtDate = fmtDate; ui.placeStage = placeStage; ui.placeGrade = placeGrade;
    ui.getBody = function () { return body; };
    function copyBtn(text) {
        return h("button", { type: "button", class: "ac_btn b_line b_sm", text: "نسخ", onclick: function () {
            if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { E.toast("اتنسخ"); }, function () { E.toast("انسخه يدويًا", "bad"); });
        } });
    }

    // ---------------- الهيكل العام ----------------
    function shell() {
        E.clear(root);
        root.appendChild(h("div", { class: "ac_card" }, [
            h("div", { class: "ac_top" }, [
                h("div", null, [h("h1", { class: "ac_h1", text: "لوحة المدرس" }), h("p", { class: "ac_sub", text: user.name + " - " + user.email, dir: "ltr" })]),
                h("div", { class: "ac_row" }, [
                    h("button", { type: "button", class: "ac_btn b_line", text: "تغيير كلمة السر", onclick: function () { pw.classList.toggle("ac_hidden"); } }),
                    h("button", { type: "button", class: "ac_btn b_dark", text: "تسجيل الخروج", onclick: function () { E.logout(); } })
                ])
            ]),
            (function () { return (pw = h("div", { class: "ac_hidden" }, [E.passwordForm({})])); })()
        ]));
        var tabs = h("div", { class: "ac_tabs", role: "tablist" }, [["courses", "الكورسات"], ["students", "الطلاب"], ["registrations", "سجل بيانات الطلاب"], ["sales", "سجل المبيعات"], ["exams", "الامتحانات"], ["results", "السجل"]].map(function (t) {
            return h("button", { type: "button", class: "ac_tab", role: "tab", "aria-selected": String(tab === t[0]), text: t[1] + (t[0] === "registrations" && pendingCount ? " (" + E.num(pendingCount) + " جديد)" : "") + (t[0] === "sales" && ui.pendingSales ? " (" + E.num(ui.pendingSales) + " جديد)" : ""), onclick: function () { tab = t[0]; render(); } });
        }));
        root.appendChild(tabs);
        body = h("div", { id: "ac_body" });
        root.appendChild(body);
    }
    var pw;
    var pendingCount = 0, regFilter = "pending", regQuery = "";

    async function render() {
        shell();
        if (tab === "courses") await coursesView();
        else if (tab === "students") await studentsView();
        else if (tab === "registrations") await registrationsView();
        else if (ui.views[tab]) await ui.views[tab]();
    }

    // ================= الكورسات =================
    async function loadCourses() { courses = (await E.call("GET", "/api/teacher/courses")).courses; }

    async function coursesView() {
        E.clear(body);
        await run(loadCourses);
        body.appendChild(courseForm(null));
        var card = h("div", { class: "ac_card" }, [h("h2", { class: "ac_h2", text: "كل الكورسات" })]);
        if (!courses.length) card.appendChild(h("p", { class: "ac_empty", text: "لسه مفيش كورسات. اعمل أول كورس من النموذج اللي فوق." }));
        else {
            var rows = courses.map(function (c) {
                return h("tr", null, [
                    h("td", { text: c.title }),
                    h("td", { text: E.courseLabel(c) + " - " + (E.SECTIONS[c.section] || "") }),
                    h("td", { text: modeLabel(c) }),
                    h("td", { text: E.num(c.lessonCount) }),
                    h("td", { text: E.num(c.enrolledCount) }),
                    h("td", null, [h("span", { class: "ac_pill " + (c.isPublished ? "p_ok" : ""), text: c.isPublished ? "منشور" : "مخفي" })]),
                    h("td", null, [h("div", { class: "ac_row" }, [
                        h("button", { type: "button", class: "ac_btn b_dark b_sm", text: "إدارة", onclick: function () { manageCourse(c.id); } }),
                        h("button", { type: "button", class: "ac_btn b_line b_sm", text: c.isPublished ? "إخفاء" : "نشر", onclick: function () {
                            run(async function () { await E.call("POST", "/api/teacher/courses/" + c.id + (c.isPublished ? "/unpublish" : "/publish"), {}); E.toast(c.isPublished ? "اتخفى الكورس" : "اتنشر الكورس"); await coursesView(); });
                        } }),
                        h("button", { type: "button", class: "ac_btn b_bad b_sm", text: "حذف", onclick: async function () {
                            if (!(await E.confirmBox("هتمسح الكورس «" + c.title + "» بكل دروسه وتقدّم الطلاب فيه. مفيش رجوع. متأكد؟", "احذف الكورس"))) return;
                            run(async function () { await E.call("DELETE", "/api/teacher/courses/" + c.id); E.toast("اتحذف الكورس"); await coursesView(); });
                        } })
                    ])])
                ]);
            });
            card.appendChild(h("div", { class: "ac_tablewrap" }, [h("table", { class: "ac_table" }, [
                h("thead", null, [h("tr", null, ["الكورس", "المرحلة", "الاشتراك", "الدروس", "المشتركين", "الحالة", ""].map(function (t) { return h("th", { text: t }); }))]),
                h("tbody", null, rows)
            ])]));
        }
        body.appendChild(card);
    }

    function modeLabel(c) {
        var m = { free: "مجاني", paid: "فوري", code: "كود", code_or_paid: "كود وفوري" }[c.accessMode] || c.accessMode;
        return m + (c.price > 0 && c.accessMode !== "code" && c.accessMode !== "free" ? " - " + E.num(c.price) + " ج" : "");
    }

    // نموذج إنشاء/تعديل كورس
    function courseForm(c, onDone) {
        var title = h("input", { id: "cf_title", maxlength: "200", required: true, value: c ? c.title : "" });
        var desc = h("textarea", { id: "cf_desc", maxlength: "2000" }); desc.value = c ? c.description : "";
        var stage = stageSelect("cf_stage", c ? c.stage : "secondary");
        var grade = gradeSelect("cf_grade", c ? c.grade : 1);
        var sect = h("select", { id: "cf_sect" }, Object.keys(E.SECTIONS).map(function (k) { return option(k, E.SECTIONS[k], (c ? c.section : "courses") === k); }));
        var MODES = [["free", "مجاني (أي طالب يفتحه بضغطة)"], ["paid", "فوري (دفع بفودافون كاش + صورة الإيصال)"], ["code", "كود (الطالب بيدخل كود إنت إديته له)"], ["code_or_paid", "كود وفوري معًا"]];
        var mode = h("select", { id: "cf_mode" }, MODES.map(function (m) { return option(m[0], m[1], (c ? c.accessMode : "code") === m[0]); }));
        var price = h("input", { id: "cf_price", type: "number", min: "0", max: "100000", step: "1", value: c ? String(c.price || 0) : "0", dir: "ltr" });
        var priceRow = field("سعر الكورس بالجنيه (بيظهر للطالب)", "cf_price", price);
        function syncMode() { var paid = mode.value === "paid" || mode.value === "code_or_paid"; priceRow.forEach(function (n) { n.style.display = paid ? "" : "none"; }); }
        mode.addEventListener("change", syncMode);
        var pub = h("input", { type: "checkbox", id: "cf_pub" }); pub.checked = c ? c.isPublished : false;
        var msg = h("p", { class: "ac_msg", role: "alert" });
        var form = h("form", { class: "ac_form", novalidate: true }, [].concat(
            field("اسم الكورس", "cf_title", title), field("وصف مختصر (اختياري)", "cf_desc", desc),
            field("المرحلة", "cf_stage", stage), field("الصف", "cf_grade", grade),
            field("القسم اللي هيظهر فيه في صفحة المرحلة", "cf_sect", sect),
            field("طريقة الاشتراك في الكورس", "cf_mode", mode), priceRow,
            [h("label", { class: "ac_check" }, [pub, "منشور (الكارت بيظهر للكل، والدخول للمشتركين بس)"]), msg,
                h("button", { type: "submit", class: "ac_btn b_dark", text: c ? "حفظ التعديلات" : "إنشاء الكورس" })]));
        form.addEventListener("submit", async function (ev) {
            ev.preventDefault(); msg.textContent = "";
            if (!title.value.trim()) { msg.textContent = "اكتب اسم الكورس."; return; }
            var data = { title: title.value.trim(), description: desc.value.trim(), stage: stage.value, grade: Number(grade.value), section: sect.value, accessMode: mode.value, isPublished: pub.checked };
            if (mode.value === "paid" || mode.value === "code_or_paid") { data.price = Number(price.value); if (!(data.price > 0)) { msg.textContent = "حدّد سعر الكورس (أكبر من صفر)."; return; } } else data.price = 0;
            try {
                if (c) await E.call("PATCH", "/api/teacher/courses/" + c.id, data); else await E.call("POST", "/api/teacher/courses", data);
                E.toast(c ? "اتحفظت التعديلات" : "اتعمل الكورس");
                if (onDone) await onDone(); else await coursesView();
            } catch (e) { msg.textContent = e.message || "حصل خطأ"; }
        });
        syncMode();
        return h("div", { class: "ac_card" }, [h("h2", { class: "ac_h2", text: c ? "تعديل الكورس" : "كورس جديد" }), form]);
    }

    // صورة الكورس (بتظهر على الكارت في صفحة المرحلة)
    function coverCard(course) {
        var card = h("div", { class: "ac_card" }, [h("h2", { class: "ac_h2", text: "صورة الكورس" })]);
        var box = h("div");
        if (course.hasCover) {
            var im = h("img", { class: "ac_thumb", alt: "صورة الكورس" });
            E.blobUrl("/api/teacher/courses/" + course.id + "/cover").then(function (u) { im.src = u; }, function () {});
            box.appendChild(im);
            box.appendChild(h("button", { type: "button", class: "ac_btn b_bad b_sm", text: "حذف الصورة", onclick: function () {
                run(async function () { await E.call("DELETE", "/api/teacher/courses/" + course.id + "/cover"); await manageCourse(course.id); });
            } }));
        }
        if (!course.isPublished) box.appendChild(h("p", { class: "ac_sub", text: "الكورس لسه مخفي: الكارت والصورة بيظهروا للكل بعد ما تنشره." }));
        var file = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp", id: "cv_file", "aria-label": "اختار صورة" });
        card.appendChild(box);
        card.appendChild(h("div", { class: "ac_form" }, [
            h("label", { for: "cv_file", text: "ارفع صورة (PNG / JPG / WebP، أقل من 1 ميجا)" }), file,
            h("button", { type: "button", class: "ac_btn b_gold", text: "رفع الصورة", onclick: function () {
                var f = file.files[0];
                if (!f) { E.toast("اختار صورة الأول", "bad"); return; }
                if (f.size > 1048576) { E.toast("الصورة أكبر من 1 ميجا", "bad"); return; }
                run(async function () { await E.upload("PUT", "/api/teacher/courses/" + course.id + "/cover", f); E.toast("اترفعت الصورة"); await manageCourse(course.id); });
            } })
        ]));
        return card;
    }

    // ---------- إدارة كورس واحد: بياناته + الدروس + المشتركين ----------
    async function manageCourse(id) {
        shell();
        var d = await run(function () { return E.call("GET", "/api/teacher/courses/" + id); });
        if (!d) { await render(); return; }
        var enr = await run(function () { return E.call("GET", "/api/teacher/courses/" + id + "/enrollments"); });
        if (!students.length) await run(async function () { students = (await E.call("GET", "/api/teacher/students?limit=200")).students; });
        E.clear(body);
        body.appendChild(h("button", { type: "button", class: "ac_btn b_line", text: "رجوع للكورسات", onclick: function () { tab = "courses"; render(); }, style: "margin-bottom:16px" }));
        body.appendChild(courseForm(d.course, function () { return manageCourse(id); }));
        body.appendChild(coverCard(d.course));
        body.appendChild(lessonsCard(d.course, d.lessons));
        body.appendChild(enrollCard(d.course, (enr && enr.enrollments) || []));
        ui.courseCards.forEach(function (fn) { var n = fn(d.course); if (n) body.appendChild(n); });
    }

    function lessonsCard(course, lessons) {
        var card = h("div", { class: "ac_card" }, [h("h2", { class: "ac_h2", text: "الدروس (" + E.num(lessons.length) + ")" })]);
        var ids = lessons.map(function (l) { return l.id; });
        function move(i, dir) {
            var j = i + dir; if (j < 0 || j >= ids.length) return;
            var next = ids.slice(); var t = next[i]; next[i] = next[j]; next[j] = t;
            run(async function () { await E.call("PUT", "/api/teacher/courses/" + course.id + "/lessons/order", { lessonIds: next }); await manageCourse(course.id); });
        }
        if (!lessons.length) card.appendChild(h("p", { class: "ac_empty", text: "لسه مفيش دروس." }));
        else card.appendChild(h("ul", { class: "ac_list" }, lessons.map(function (l, i) {
            return h("li", null, [h("div", { class: "ac_lesson", style: "cursor:default;flex-wrap:wrap" }, [
                h("span", { class: "ic", text: E.num(i + 1) }),
                h("span", { text: l.title, style: "flex:1" }),
                h("span", { class: "ac_pill " + (l.isPublished ? "p_ok" : ""), text: l.isPublished ? "منشور" : "مخفي" }),
                l.kind === "exam" ? h("span", { class: "ac_pill", text: "امتحان" }) : null,
                h("button", { type: "button", class: "ac_btn b_line b_sm", "aria-label": "لفوق", text: "↑", onclick: function () { move(i, -1); } }),
                h("button", { type: "button", class: "ac_btn b_line b_sm", "aria-label": "لتحت", text: "↓", onclick: function () { move(i, 1); } }),
                h("button", { type: "button", class: "ac_btn b_line b_sm", text: "تعديل", onclick: function () { fillLessonForm(l); } }),
                h("button", { type: "button", class: "ac_btn b_bad b_sm", text: "حذف", onclick: async function () {
                    if (!(await E.confirmBox("تمسح الدرس «" + l.title + "»؟", "احذف الدرس"))) return;
                    run(async function () { await E.call("DELETE", "/api/teacher/lessons/" + l.id); E.toast("اتحذف الدرس"); await manageCourse(course.id); });
                } })
            ])]);
        })));
        // نموذج إضافة/تعديل درس
        var editing = null;
        var title = h("input", { id: "lf_title", maxlength: "200" });
        var desc = h("textarea", { id: "lf_desc", maxlength: "2000" });
        var kind = h("select", { id: "lf_kind" }, [option("video", "فيديو"), option("exam", "امتحان")]);
        var prov = h("select", { id: "lf_prov" }, [option("direct", "رابط مباشر (غير محمي من النسخ)"), option("signed", "رابط موقّع بوقت (محتاج خدمة فيديو تدعمه)")]);
        var ref = h("input", { id: "lf_ref", type: "url", dir: "ltr", placeholder: "https://...", maxlength: "1000" });
        var mins = h("input", { id: "lf_mins", type: "number", min: "0", max: "1440" });
        var pub = h("input", { type: "checkbox", id: "lf_pub" }); pub.checked = true;
        var msg = h("p", { class: "ac_msg", role: "alert" });
        var submit = h("button", { type: "submit", class: "ac_btn b_dark", text: "إضافة الدرس" });
        var cancel = h("button", { type: "button", class: "ac_btn b_line ac_hidden", text: "إلغاء التعديل", onclick: function () { reset(); } });
        // ---- امتحان قصير على الدرس (اختياري) ----
        var quizQs = [];
        var passIn = h("input", { id: "lf_pass", type: "number", min: "0", max: "100", value: "0" });
        var quizBox = h("div", { class: "ac_quiz", id: "lf_quiz" });
        function renderQuiz() {
            E.clear(quizBox);
            if (!quizQs.length) quizBox.appendChild(h("p", { class: "ac_sub", text: "مفيش امتحان على الدرس ده. لو ضفت أسئلة، الطالب لازم يمتحن عليه عشان يفتح الدرس اللي بعده." }));
            quizQs.forEach(function (q, qi) {
                var qt = h("textarea", { maxlength: "500", "aria-label": "نص السؤال " + (qi + 1), placeholder: "نص السؤال" }); qt.value = q.text;
                qt.addEventListener("input", function () { q.text = qt.value; });
                var rows = q.choices.map(function (c, ci) {
                    var r = h("input", { type: "radio", name: "lq_a" + qi, "aria-label": "الإجابة الصح" });
                    r.checked = q.answer === ci; r.addEventListener("change", function () { q.answer = ci; });
                    var t = h("input", { type: "text", maxlength: "200", value: c, placeholder: "الاختيار " + E.LETTERS[ci], "aria-label": "اختيار " + E.LETTERS[ci] });
                    t.addEventListener("input", function () { q.choices[ci] = t.value; });
                    return h("div", { class: "ac_qrow" }, [r, t,
                        q.choices.length > 2 ? h("button", { type: "button", class: "ac_btn b_line b_sm", text: "حذف", onclick: function () { q.choices.splice(ci, 1); if (q.answer === ci) q.answer = -1; else if (q.answer > ci) q.answer -= 1; renderQuiz(); } }) : null]);
                });
                quizBox.appendChild(h("div", { class: "ac_qcard" }, [
                    h("div", { class: "ac_row" }, [h("strong", { text: "سؤال " + E.num(qi + 1) }),
                        h("button", { type: "button", class: "ac_btn b_bad b_sm", text: "حذف السؤال", onclick: function () { quizQs.splice(qi, 1); renderQuiz(); } })]),
                    qt, h("p", { class: "ac_sub", text: "علّم الدايرة جنب الإجابة الصح:" })].concat(rows, [
                    q.choices.length < 5 ? h("button", { type: "button", class: "ac_btn b_line b_sm", text: "إضافة اختيار", onclick: function () { q.choices.push(""); renderQuiz(); } }) : null])));
            });
            if (quizQs.length < 20) quizBox.appendChild(h("button", { type: "button", class: "ac_btn b_gold b_sm", text: "إضافة سؤال", onclick: function () { quizQs.push({ text: "", choices: ["", "", "", ""], answer: -1 }); renderQuiz(); } }));
        }
        renderQuiz();
        var pdfBox = h("div", { class: "ac_pdfbox", id: "lf_pdf" });
        function renderPdf() {
            E.clear(pdfBox);
            if (!editing) { pdfBox.appendChild(h("p", { class: "ac_sub", text: "احفظ الدرس الأول، وبعدها تقدر ترفع ملف PDF اختياري (شرح مثلاً) من «تعديل الدرس»." })); return; }
            if (editing.hasPdf) {
                pdfBox.appendChild(h("p", { class: "ac_sub", text: "الملف الحالي: " + (editing.pdfName || "PDF") }));
                pdfBox.appendChild(h("button", { type: "button", class: "ac_btn b_bad b_sm", text: "حذف الملف", onclick: function () {
                    run(async function () { await E.call("DELETE", "/api/teacher/lessons/" + editing.id + "/pdf"); E.toast("اتحذف الملف"); await manageCourse(course.id); });
                } }));
            }
            var pf = h("input", { type: "file", accept: "application/pdf,.pdf", id: "lf_pdf_file", "aria-label": "اختار ملف PDF" });
            pdfBox.appendChild(pf);
            pdfBox.appendChild(h("button", { type: "button", class: "ac_btn b_gold b_sm", text: "رفع الملف", onclick: function () {
                var f = pf.files[0];
                if (!f) { E.toast("اختار ملف PDF الأول", "bad"); return; }
                if (f.size > 8 * 1048576) { E.toast("الملف أكبر من 8 ميجا", "bad"); return; }
                run(async function () { await E.upload("PUT", "/api/teacher/lessons/" + editing.id + "/pdf?name=" + encodeURIComponent(f.name), f); E.toast("اترفع الملف"); await manageCourse(course.id); });
            } }));
        }
        renderPdf();
        var form = h("form", { class: "ac_form", novalidate: true, id: "ac_lessonform" }, [].concat(
            [h("h3", { class: "ac_h2", id: "lf_h", text: "إضافة درس", style: "margin-top:16px" })],
            field("عنوان الدرس", "lf_title", title), field("وصف (اختياري)", "lf_desc", desc),
            field("النوع", "lf_kind", kind), field("طريقة رابط الفيديو", "lf_prov", prov),
            field("رابط الفيديو / الامتحان (يوتيوب أو جوجل درايف أو رابط mp4 مباشر)", "lf_ref", ref), field("المدة بالدقايق (اختياري)", "lf_mins", mins),
            [h("h3", { class: "ac_h2", text: "امتحان على الدرس (اختياري، لحد 20 سؤال)", style: "margin-top:14px" }), quizBox],
            field("نسبة النجاح المطلوبة لفتح الدرس اللي بعده (0 = يكفي إنه يمتحن)", "lf_pass", passIn),
            [h("h3", { class: "ac_h2", text: "ملف PDF للدرس (اختياري)", style: "margin-top:14px" }), pdfBox],
            [h("label", { class: "ac_check" }, [pub, "منشور"]), msg, h("div", { class: "ac_row" }, [submit, cancel])]));
        function reset() { editing = null; form.reset(); pub.checked = true; quizQs = []; passIn.value = "0"; renderQuiz(); renderPdf(); submit.textContent = "إضافة الدرس"; cancel.classList.add("ac_hidden"); document.getElementById("lf_h").textContent = "إضافة درس"; msg.textContent = ""; }
        function fill(l) {
            editing = l; title.value = l.title; desc.value = l.description || ""; kind.value = l.kind; prov.value = l.videoProvider;
            ref.value = l.videoRef || ""; mins.value = l.durationSeconds ? Math.round(l.durationSeconds / 60) : ""; pub.checked = l.isPublished;
            quizQs = l.quiz ? JSON.parse(JSON.stringify(l.quiz)) : []; passIn.value = String(l.quizPassPercent || 0); renderQuiz(); renderPdf();
            submit.textContent = "حفظ الدرس"; cancel.classList.remove("ac_hidden"); document.getElementById("lf_h").textContent = "تعديل الدرس";
            form.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        fillLessonForm = fill;
        form.addEventListener("submit", async function (ev) {
            ev.preventDefault(); msg.textContent = "";
            if (!title.value.trim()) { msg.textContent = "اكتب عنوان الدرس."; return; }
            if (ref.value && !/^https?:\/\//i.test(ref.value.trim())) { msg.textContent = "الرابط لازم يبدأ بـ https://"; return; }
            var data = { title: title.value.trim(), description: desc.value.trim(), kind: kind.value, videoProvider: prov.value,
                videoRef: ref.value.trim(), isPublished: pub.checked };
            if (mins.value !== "") data.durationSeconds = Math.round(Number(mins.value) * 60);
            for (var qi = 0; qi < quizQs.length; qi++) {
                var q = quizQs[qi];
                if (!q.text.trim()) { msg.textContent = "اكتب نص السؤال " + (qi + 1) + "."; return; }
                if (q.choices.some(function (c) { return !c.trim(); })) { msg.textContent = "املأ كل اختيارات السؤال " + (qi + 1) + " أو احذف الفاضي."; return; }
                if (!(q.answer >= 0 && q.answer < q.choices.length)) { msg.textContent = "علّم الإجابة الصح للسؤال " + (qi + 1) + "."; return; }
            }
            var pass = Number(passIn.value);
            if (!Number.isInteger(pass) || pass < 0 || pass > 100) { msg.textContent = "نسبة النجاح من 0 لـ 100."; return; }
            data.quizPassPercent = pass;
            if (quizQs.length) data.quiz = quizQs.map(function (x) { return { text: x.text.trim(), choices: x.choices.map(function (c) { return c.trim(); }), answer: x.answer }; });
            else if (editing) data.quiz = null;
            try {
                if (editing) await E.call("PATCH", "/api/teacher/lessons/" + editing.id, data);
                else await E.call("POST", "/api/teacher/courses/" + course.id + "/lessons", data);
                E.toast(editing ? "اتحفظ الدرس" : "اتضاف الدرس");
                await manageCourse(course.id);
            } catch (e) { msg.textContent = e.message || "حصل خطأ"; }
        });
        card.appendChild(form);
        return card;
    }
    var fillLessonForm = function () {};

    function enrollCard(course, list) {
        var card = h("div", { class: "ac_card" }, [h("h2", { class: "ac_h2", text: "الطلاب المشتركين (" + E.num(list.length) + ")" })]);
        if (!list.length) card.appendChild(h("p", { class: "ac_empty", text: "مفيش طلاب مشتركين لسه." }));
        else card.appendChild(h("ul", { class: "ac_list" }, list.map(function (r) {
            return h("li", null, [h("div", { class: "ac_lesson", style: "cursor:default;flex-wrap:wrap" }, [
                h("span", { text: r.name, style: "flex:1" }), h("span", { class: "ac_sub", dir: "ltr", text: r.email }),
                r.expiresAt ? h("span", { class: "ac_pill", text: "ينتهي " + fmtDate(r.expiresAt) }) : null,
                h("button", { type: "button", class: "ac_btn b_bad b_sm", text: "إلغاء الاشتراك", onclick: async function () {
                    if (!(await E.confirmBox("تلغي اشتراك " + r.name + " في الكورس ده؟", "إلغاء الاشتراك"))) return;
                    run(async function () { await E.call("DELETE", "/api/teacher/courses/" + course.id + "/enrollments/" + r.userId); await manageCourse(course.id); });
                } })
            ])]);
        })));
        var enrolledIds = list.map(function (r) { return r.userId; });
        var avail = students.filter(function (s) { return enrolledIds.indexOf(s.id) === -1 && s.isActive; });
        if (avail.length) {
            var sel = h("select", { id: "en_sel" }, avail.map(function (s) { return option(s.id, s.name + " - " + s.email); }));
            var exp = h("input", { type: "date", id: "en_exp" });
            card.appendChild(h("div", { class: "ac_form", style: "margin-top:14px" }, [
                h("label", { for: "en_sel", text: "إضافة طالب للكورس" }), sel,
                h("label", { for: "en_exp", text: "تاريخ انتهاء الاشتراك (اختياري)" }), exp,
                h("button", { type: "button", class: "ac_btn b_gold", text: "أضف الطالب", onclick: function () {
                    run(async function () {
                        var b = exp.value ? { expiresAt: new Date(exp.value + "T23:59:59").toISOString() } : {};
                        await E.call("PUT", "/api/teacher/courses/" + course.id + "/enrollments/" + sel.value, b);
                        E.toast("اتضاف الطالب"); await manageCourse(course.id);
                    });
                } })
            ]));
        } else if (!students.length) card.appendChild(h("p", { class: "ac_sub", text: "ضيف طلاب من تبويب «الطلاب» الأول." }));
        return card;
    }

    // ================= سجل بيانات الطلاب (اللي سجّلوا بنفسهم) =================
    async function registrationsView() {
        E.clear(body);
        var d = null;
        await run(async function () { d = await E.call("GET", "/api/teacher/registrations?status=" + (regFilter === "all" ? "" : regFilter) + (regQuery ? "&q=" + encodeURIComponent(regQuery) : "")); });
        if (!d) return;
        if (pendingCount !== d.counts.pending) { pendingCount = d.counts.pending; var t0 = document.querySelectorAll(".ac_tab")[2]; if (t0) t0.textContent = "سجل بيانات الطلاب" + (pendingCount ? " (" + E.num(pendingCount) + " جديد)" : ""); }
        var filters = [["pending", "مستني التفعيل", d.counts.pending], ["approved", "مفعّل", d.counts.approved], ["rejected", "مرفوض", d.counts.rejected], ["all", "الكل", d.counts.pending + d.counts.approved + d.counts.rejected]];
        var bar = h("div", { class: "ac_tabs", role: "tablist" }, filters.map(function (f) {
            return h("button", { type: "button", class: "ac_tab", role: "tab", "aria-selected": String(regFilter === f[0]), text: f[1] + " (" + E.num(f[2]) + ")", onclick: function () { regFilter = f[0]; registrationsView(); } });
        }));
        var search = h("input", { class: "ac_in", type: "search", placeholder: "ابحث بالاسم أو التليفون أو الكود أو الإيميل", value: regQuery, "aria-label": "بحث" });
        var timer = 0;
        search.addEventListener("input", function () { window.clearTimeout(timer); timer = window.setTimeout(function () { regQuery = search.value.trim(); registrationsView(); }, 400); });
        var card = h("div", { class: "ac_card" }, [h("h2", { class: "ac_h2", text: "سجل بيانات الطلاب" }),
            h("p", { class: "ac_sub", text: "الطلاب اللي عملوا حساب بنفسهم. الحساب مش بيشتغل غير لما تفعّله، وبعد التفعيل اشترّكه في الكورسات من تبويب «الكورسات»." }), bar, search]);
        if (!d.registrations.length) card.appendChild(h("p", { class: "ac_empty", text: regQuery ? "مفيش نتايج." : "مفيش تسجيلات هنا." }));
        else card.appendChild(h("div", { class: "ac_tablewrap" }, [h("table", { class: "ac_table", style: "min-width:1100px" }, [
            h("thead", null, [h("tr", null, ["الكود", "الاسم", "تليفون الطالب", "تليفون ولي الأمر", "المحافظة", "العنوان", "المرحلة والصف", "الإيميل", "تاريخ التسجيل", "الحالة", ""].map(function (t) { return h("th", { text: t }); }))]),
            h("tbody", null, d.registrations.map(registrationRow))
        ])]));
        body.appendChild(card);
    }

    function registrationRow(r) {
        var pill = r.approval === "pending" ? h("span", { class: "ac_pill p_wait", text: "مستني التفعيل" }) : r.approval === "approved" ? h("span", { class: "ac_pill p_ok", text: r.isActive ? "مفعّل" : "موقوف" }) : h("span", { class: "ac_pill p_bad", text: "مرفوض" });
        function setApproval(v, okMsg) { return function () { run(async function () { await E.call("PATCH", "/api/teacher/students/" + r.id, { approval: v }); E.toast(okMsg); await registrationsView(); }); }; }
        var acts = [];
        if (r.approval !== "approved") acts.push(h("button", { type: "button", class: "ac_btn b_gold b_sm", text: "تفعيل الحساب", onclick: setApproval("approved", "اتفعّل حساب " + r.name) }));
        if (r.approval === "pending") acts.push(h("button", { type: "button", class: "ac_btn b_line b_sm", text: "رفض", onclick: async function () {
            if (await E.confirmBox("ترفض تسجيل " + r.name + "؟ مش هيعرف يدخل.", "ارفض")) setApproval("rejected", "اترفض التسجيل")();
        } }));
        if (r.approval !== "approved") acts.push(h("button", { type: "button", class: "ac_btn b_bad b_sm", text: "حذف", onclick: async function () {
            if (!(await E.confirmBox("تمسح تسجيل " + r.name + " نهائيًا؟ رقم تليفونه هيبقى متاح للتسجيل تاني.", "احذف"))) return;
            run(async function () { await E.call("DELETE", "/api/teacher/registrations/" + r.id); E.toast("اتحذف التسجيل"); await registrationsView(); });
        } }));
        return h("tr", null, [
            h("td", { text: r.studentCode ? "#" + r.studentCode : "-" }), h("td", { text: r.name }), h("td", { text: r.phone || "-", dir: "ltr" }), h("td", { text: r.guardianPhone || "-", dir: "ltr" }), h("td", { text: r.governorate || "-" }), h("td", { text: r.address || "-" }),
            h("td", { text: (E.STAGES[r.stage] || "-") + " - " + (r.grade ? "الصف " + E.GRADES[r.grade] : "-") }), h("td", { text: r.email, dir: "ltr" }),
            h("td", { text: fmtDate(r.createdAt) }), h("td", null, [pill]), h("td", null, [h("div", { class: "ac_row" }, acts)])
        ]);
    }

    // ================= الطلاب =================
    var query = "";
    async function loadStudents() { students = (await E.call("GET", "/api/teacher/students?limit=200" + (query ? "&q=" + encodeURIComponent(query) : ""))).students; }

    async function studentsView(extra) {
        E.clear(body);
        await run(async function () { await loadStudents(); if (!courses.length) await loadCourses(); });
        if (extra) body.appendChild(extra);
        body.appendChild(studentForm());
        var search = h("input", { class: "ac_in", type: "search", placeholder: "ابحث بالاسم أو الإيميل", value: query, "aria-label": "بحث" });
        var timer = 0;
        search.addEventListener("input", function () { window.clearTimeout(timer); timer = window.setTimeout(function () { query = search.value.trim(); studentsView(); }, 400); });
        var card = h("div", { class: "ac_card" }, [h("h2", { class: "ac_h2", text: "الطلاب (" + E.num(students.length) + ")" }), search]);
        if (!students.length) card.appendChild(h("p", { class: "ac_empty", text: query ? "مفيش نتايج." : "لسه مفيش طلاب. ضيف أول طالب من النموذج اللي فوق." }));
        else card.appendChild(h("div", { class: "ac_tablewrap" }, [h("table", { class: "ac_table" }, [
            h("thead", null, [h("tr", null, ["الكود", "الاسم", "التليفون / الإيميل", "المرحلة والصف", "الحالة", "كورسات", "دروس مكتملة", "آخر نشاط", ""].map(function (t) { return h("th", { text: t }); }))]),
            h("tbody", null, students.map(studentRow))
        ])]));
        body.appendChild(card);
    }

    function studentRow(s) {
        return h("tr", null, [
            h("td", { text: s.studentCode ? "#" + s.studentCode : "-" }), h("td", { text: s.name }), h("td", { dir: "ltr", text: (s.phone ? s.phone + " | " : "") + s.email }), h("td", null, [placeCell(s)]),
            h("td", null, [h("span", { class: "ac_pill " + (s.isActive ? "p_ok" : "p_bad"), text: s.isActive ? "نشط" : "موقوف" }), s.mustChangePassword ? h("span", { class: "ac_pill", text: "لسه مغيّرش كلمة السر", style: "margin-inline-start:6px" }) : null]),
            h("td", { text: E.num(s.courseCount) }), h("td", { text: E.num(s.completedLessons) }), h("td", { text: fmtDate(s.lastActivity) }),
            h("td", null, [h("div", { class: "ac_row" }, [
                h("button", { type: "button", class: "ac_btn b_dark b_sm", text: "التقدّم", onclick: function () { progressView(s); } }),
                h("button", { type: "button", class: "ac_btn b_line b_sm", text: "رابط كلمة سر", onclick: async function () {
                    run(async function () {
                        var d = await E.call("POST", "/api/teacher/students/" + s.id + "/reset-token", {});
                        studentsView(secretBox("رابط تغيير كلمة السر لـ " + s.name + " (بيشتغل مرة واحدة وبينتهي " + fmtDate(d.expiresAt) + "). ابعته للطالب على واتساب:", d.resetUrl));
                        window.scrollTo({ top: 0, behavior: "smooth" });
                    });
                } }),
                h("button", { type: "button", class: "ac_btn b_sm " + (s.isActive ? "b_bad" : "b_gold"), text: s.isActive ? "إيقاف" : "تفعيل", onclick: async function () {
                    if (s.isActive && !(await E.confirmBox("توقف حساب " + s.name + "؟ هيتسجّل خروجه فورًا ومش هيعرف يدخل.", "إيقاف الحساب"))) return;
                    run(async function () { await E.call("PATCH", "/api/teacher/students/" + s.id, { isActive: !s.isActive }); E.toast(s.isActive ? "اتوقف الحساب" : "اتفعّل الحساب"); await studentsView(); });
                } })
            ])])
        ]);
    }

    function placeCell(s) {
        var st = placeStage("pl_s_" + s.id, s.stage, true), gr = placeGrade("pl_g_" + s.id, s.grade, true);
        st.setAttribute("aria-label", "مرحلة " + s.name); gr.setAttribute("aria-label", "صف " + s.name);
        async function save() {
            if (!st.value || !gr.value) return;
            await run(async function () { await E.call("PATCH", "/api/teacher/students/" + s.id, { stage: st.value, grade: Number(gr.value) }); s.stage = st.value; s.grade = Number(gr.value); E.toast("اتحفظ صف " + s.name); });
        }
        st.addEventListener("change", save); gr.addEventListener("change", save);
        return h("div", { class: "ac_row" }, [st, gr]);
    }

    function secretBox(text, value) {
        return h("div", { class: "ac_card" }, [h("p", { class: "ac_h2", text: text }), h("div", { class: "ac_secret" }, [h("code", { text: value })]),
            h("div", { class: "ac_row", style: "margin-top:10px" }, [copyBtn(value), h("span", { class: "ac_sub", text: "بيظهر مرة واحدة بس. لو قفلت الصفحة هتعمل واحد جديد." })])]);
    }

    function studentForm() {
        var name = h("input", { id: "sf_name", maxlength: "120" });
        var email = h("input", { id: "sf_email", type: "email", dir: "ltr", maxlength: "254", autocomplete: "off" });
        var stg = placeStage("sf_stage", "", true), grd = placeGrade("sf_grade", 0, true);
        var pass = h("input", { id: "sf_pass", type: "text", dir: "ltr", maxlength: "128", autocomplete: "off", placeholder: "سيبها فاضية وهيتولّد باسورد مؤقت" });
        var msg = h("p", { class: "ac_msg", role: "alert" });
        var checks = courses.map(function (c) {
            var cb = h("input", { type: "checkbox", value: c.id });
            return h("label", { class: "ac_check" }, [cb, c.title + " (" + E.courseLabel(c) + ")"]);
        });
        var form = h("form", { class: "ac_form", novalidate: true }, [].concat(
            field("اسم الطالب", "sf_name", name), field("إيميل الطالب (هو اسم المستخدم)", "sf_email", email),
            field("المرحلة (علشان يشوف امتحانات صفه)", "sf_stage", stg), field("الصف", "sf_grade", grd),
            field("كلمة سر مؤقتة (اختياري)", "sf_pass", pass),
            [h("label", { text: "اشتراك في كورسات (اختياري)" })], checks, [msg, h("button", { type: "submit", class: "ac_btn b_dark", text: "إنشاء الحساب" })]));
        form.addEventListener("submit", async function (ev) {
            ev.preventDefault(); msg.textContent = "";
            if (!name.value.trim() || !email.value.trim()) { msg.textContent = "اكتب اسم الطالب وإيميله."; return; }
            var data = { name: name.value.trim(), email: email.value.trim(), courseIds: Array.prototype.map.call(form.querySelectorAll('input[type=checkbox]:checked'), function (c) { return c.value; }) };
            if (pass.value) data.password = pass.value;
            if (stg.value) data.stage = stg.value;
            if (grd.value) data.grade = Number(grd.value);
            if (!!stg.value !== !!grd.value) { msg.textContent = "اختار المرحلة والصف مع بعض، أو سيبهم الاتنين فاضيين."; return; }
            try {
                var d = await E.call("POST", "/api/teacher/students", data);
                E.toast("اتعمل حساب " + d.student.name);
                await studentsView(secretBox("كلمة السر المؤقتة لـ " + d.student.name + " (" + d.student.email + ")، هيطلب منه يغيّرها أول دخول:", d.temporaryPassword));
            } catch (e) { msg.textContent = e.message || "حصل خطأ"; }
        });
        return h("div", { class: "ac_card" }, [h("h2", { class: "ac_h2", text: "طالب جديد" }), form]);
    }

    async function progressView(s) {
        var d = await run(function () { return E.call("GET", "/api/teacher/students/" + s.id + "/progress"); });
        if (!d) return;
        E.clear(body);
        body.appendChild(h("button", { type: "button", class: "ac_btn b_line", text: "رجوع للطلاب", onclick: function () { studentsView(); }, style: "margin-bottom:16px" }));
        var card = h("div", { class: "ac_card" }, [h("h2", { class: "ac_h2", text: "تقدّم " + d.student.name }), h("p", { class: "ac_sub", dir: "ltr", text: d.student.email })]);
        if (!d.courses.length) card.appendChild(h("p", { class: "ac_empty", text: "الطالب مش مشترك في أي كورس." }));
        d.courses.forEach(function (c) {
            card.appendChild(h("div", { style: "margin-top:18px" }, [
                h("p", { class: "ac_course_t", text: c.title }),
                h("div", { class: "ac_bar" }, [h("span", { style: "width:" + c.progressPercent + "%" })]),
                h("p", { class: "ac_course_m", text: E.num(c.completedCount) + " من " + E.num(c.lessonCount) + " (" + E.num(c.progressPercent) + "٪)" }),
                h("ul", { class: "ac_list", style: "margin-top:8px" }, c.lessons.map(function (l) {
                    return h("li", null, [h("div", { class: "ac_lesson" + (l.completed ? " is_done" : ""), style: "cursor:default" }, [h("span", { class: "ic", text: l.completed ? "✓" : "-" }), h("span", { text: l.title })])]);
                }))
            ]));
        });
        body.appendChild(card);
    }

    E.requireUser("teacher").then(async function (u) {
        if (!u) return;
        user = u;
        try { pendingCount = (await E.call("GET", "/api/teacher/registrations?status=pending")).counts.pending; } catch (e) { /* العدّاد اختياري */ }
        return render();
    }).catch(function (e) {
        E.clear(root);
        root.appendChild(h("div", { class: "ac_card" }, [h("p", { class: "ac_msg", text: e.message || "حصل خطأ" })]));
    });
})();
