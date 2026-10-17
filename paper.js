// ================== صفحة حل الامتحان (للطالب) ==================
(function () {
    "use strict";
    var E = window.Eladham, h = E.h;
    var root = document.getElementById("ac_root");
    var id = new URLSearchParams(location.search).get("id") || "";
    var data = null;
    var answers = [];
    var sheetCard, countEl;

    function fail(msg) {
        E.clear(root);
        root.appendChild(h("div", { class: "ac_card" }, [h("p", { class: "ac_msg", text: msg }), h("a", { class: "ac_btn b_line", href: "dashboard.html", text: "رجوع للوحتي" })]));
    }

    function header(ex) {
        return h("div", { class: "ac_card" }, [h("div", { class: "ac_top" }, [
            h("div", null, [h("h1", { class: "ac_h1", text: ex.title }), h("p", { class: "ac_sub", text: E.placeLabel(ex.stage, ex.grade) + " - " + E.examWhen(ex) + " - " + E.num(ex.questionCount) + " سؤال" }),
                ex.description ? h("p", { class: "ac_sub", text: ex.description }) : null]),
            h("a", { class: "ac_btn b_line", href: "dashboard.html", text: "رجوع" })
        ])]);
    }

    // ورقة الأسئلة: صور أو PDF
    async function pagesCard(files) {
        var card = h("div", { class: "ac_card" }, [h("h2", { class: "ac_h2", text: "ورقة الأسئلة" })]);
        if (!files.length) { card.appendChild(h("p", { class: "ac_empty", text: "المدرس لسه ما رفعش ورقة الأسئلة." })); return card; }
        var wrap = h("div", { class: "ac_pages" });
        card.appendChild(wrap);
        for (var i = 0; i < files.length; i++) {
            (function (f, n) {
                var holder = h("p", { class: "ac_empty", text: "جاري تحميل الصفحة " + E.num(n) + "..." });
                wrap.appendChild(holder);
                E.blobUrl("/api/exams/" + id + "/files/" + f.id).then(function (u) {
                    if (f.contentType === "application/pdf") {
                        holder.replaceWith(h("div", null, [
                            h("iframe", { src: u, title: "ورقة الأسئلة PDF" }),
                            h("p", { class: "ac_sub" }, [h("a", { href: u, target: "_blank", class: "ac_btn b_line b_sm", text: "افتح الـ PDF في صفحة جديدة" }), " (لو مش ظاهر عندك، الموبايل أحيانًا ما بيعرضش PDF هنا)"])
                        ]));
                    } else holder.replaceWith(h("img", { src: u, alt: "صفحة " + n + " من الأسئلة" }));
                }, function () { holder.textContent = "مقدرتش أحمّل الصفحة " + E.num(n); holder.className = "ac_msg"; });
            })(files[i], i + 1);
        }
        return card;
    }

    // ورقة الإجابة. review = { key, wrong } بعد التسليم
    function buildSheet(ex, review) {
        var rows = [];
        for (var q = 0; q < ex.questionCount; q++) {
            (function (qi) {
                var missed = review && review.wrong.indexOf(qi + 1) !== -1;
                var row = h("div", { class: "ac_q" + (missed ? " is_miss" : "") }, [h("span", { class: "ac_qn", text: "س" + E.num(qi + 1) })]);
                for (var j = 0; j < ex.choicesCount; j++) {
                    (function (ji) {
                        var r = h("input", { type: "radio", name: "a" + qi, value: String(ji), "aria-label": "سؤال " + (qi + 1) + " الاختيار " + E.LETTERS[ji] });
                        var cls = "ac_opt";
                        if (review) {
                            r.disabled = true;
                            if (answers[qi] === ji) r.checked = true;
                            if (review.key) {
                                if (review.key[qi] === ji) cls += " is_right";
                                else if (answers[qi] === ji) cls += " is_wrong";
                            } else if (answers[qi] === ji) cls += missed ? " is_wrong" : " is_right";
                        } else {
                            r.addEventListener("change", function () { answers[qi] = ji; updateCount(); });
                        }
                        row.appendChild(h("label", { class: cls }, [r, h("span", { text: E.LETTERS[ji] })]));
                    })(j);
                }
                rows.push(row);
            })(q);
        }
        return rows;
    }
    function answered() { return answers.filter(function (a) { return a !== null && a !== undefined; }).length; }
    function updateCount() { if (countEl) countEl.textContent = "حليت " + E.num(answered()) + " من " + E.num(data.exam.questionCount); }

    function sheetView() {
        var ex = data.exam;
        answers = new Array(ex.questionCount).fill(null);
        var card = h("div", { class: "ac_card ac_sheet" });
        card.appendChild(h("h2", { class: "ac_h2", text: "ورقة الإجابة" }));
        countEl = h("p", { class: "ac_sub" }); card.appendChild(countEl); updateCount();
        buildSheet(ex, null).forEach(function (r) { card.appendChild(r); });
        var msg = h("p", { class: "ac_msg", role: "alert" });
        var btn = h("button", { type: "button", class: "ac_btn b_dark", text: "تسليم الامتحان" });
        btn.addEventListener("click", async function () {
            msg.textContent = "";
            var left = ex.questionCount - answered();
            if (left > 0 && !(await E.confirmBox("لسه في " + E.num(left) + " سؤال ما اتحلش. تسلّم كده؟", "سلّم الامتحان"))) return;
            btn.disabled = true;
            try {
                var res = await E.call("POST", "/api/exams/" + id + "/submit", { answers: answers });
                showResult(res);
            } catch (e) { msg.textContent = e.message || "حصل خطأ"; btn.disabled = false; }
        });
        card.appendChild(msg); card.appendChild(btn);
        return card;
    }

    function showResult(res) {
        var ex = data.exam, a = res.attempt;
        var card = h("div", { class: "ac_card ac_sheet" });
        card.appendChild(h("h2", { class: "ac_h2", text: "نتيجتك" }));
        card.appendChild(h("div", { class: "ac_score", role: "img", "aria-label": "الدرجة " + a.score + " من " + a.total }, [h("b", { text: E.num(a.score) + " / " + E.num(a.total) }), h("span", { text: E.num(a.percent) + "٪" })]));
        card.appendChild(h("div", { class: "ac_stat" }, [
            h("span", { text: "صح: " + E.num(a.score) }), h("span", { text: "غلط: " + E.num(res.wrong.length - a.skipped) }), h("span", { text: "ما اتحلش: " + E.num(a.skipped) })
        ]));
        if (res.wrong.length) card.appendChild(h("p", { class: "ac_sub", text: "الأسئلة اللي محتاجة مراجعة: " + res.wrong.map(function (n) { return E.num(n); }).join("، ") }));
        else card.appendChild(h("p", { class: "ac_sub", text: "ممتاز! كل إجاباتك صح." }));
        if (res.answerKey) card.appendChild(h("p", { class: "ac_sub", text: "الأخضر هو الإجابة الصح، والأحمر إجابتك الغلط." }));
        answers = res.yourAnswers;
        buildSheet(ex, { key: res.answerKey, wrong: res.wrong }).forEach(function (r) { card.appendChild(r); });
        var left = ex.maxAttempts === 0 || a.attemptNo < ex.maxAttempts;
        card.appendChild(h("div", { class: "ac_row", style: "margin-top:12px" }, [
            h("a", { class: "ac_btn b_dark", href: "dashboard.html", text: "رجوع للامتحانات" }),
            left ? h("button", { type: "button", class: "ac_btn b_line", text: "حاول تاني", onclick: function () { location.reload(); } }) : null
        ]));
        sheetCard.replaceWith(card); sheetCard = card;
        card.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function doneView(attempts) {
        var card = h("div", { class: "ac_card ac_sheet" }, [h("h2", { class: "ac_h2", text: "محاولاتك" }),
            h("p", { class: "ac_sub", text: "خلّصت عدد المحاولات المسموحة للامتحان ده. لو عايز تحاول تاني كلّم المدرس." })]);
        attempts.forEach(function (a) {
            card.appendChild(h("p", { class: "ac_q", text: "المحاولة " + E.num(a.attemptNo) + ": " + E.num(a.score) + " / " + E.num(a.total) + " (" + E.num(Math.round(a.score * 100 / a.total)) + "٪)" }));
        });
        card.appendChild(h("a", { class: "ac_btn b_dark", href: "dashboard.html", text: "رجوع" }));
        return card;
    }

    E.requireUser("student").then(async function (u) {
        if (!u) return;
        if (u.mustChangePassword) { location.replace("dashboard.html"); return; }
        if (!id) { fail("رابط الامتحان ناقص."); return; }
        try { data = await E.call("GET", "/api/exams/" + encodeURIComponent(id)); }
        catch (e) { fail(e.status === 404 ? "الامتحان ده مش متاح ليك." : (e.message || "حصل خطأ")); return; }
        E.clear(root);
        root.appendChild(header(data.exam));
        sheetCard = data.canAttempt ? sheetView() : doneView(data.attempts);
        var pages = await pagesCard(data.files);
        root.appendChild(h("div", { class: "ac_split" }, [pages, sheetCard]));
        document.title = "الادهم - " + data.exam.title;
    }).catch(function (e) { fail(e.message || "حصل خطأ"); });
})();
