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

    // ================== امتحان بأسئلة مكتوبة: نفس شكل صفحة الامتحان التفاعلي، والتصحيح على السيرفر ==================
    function ensureExamCss() {
        if (document.getElementById("qz_css")) return;
        var l = document.createElement("link"); l.rel = "stylesheet"; l.id = "qz_css"; l.href = "css/exam.css"; document.head.appendChild(l);
    }
    function qel(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }

    function typedView() {
        ensureExamCss();
        var ex = data.exam, qs = data.questions, total = qs.length;
        var wrap = qel("div", "qz_wrap"); wrap.setAttribute("aria-live", "polite");
        var cards = [], fillEl, progEl, submitBtn;
        var sel = new Array(total).fill(-1);

        function head() {
            var hd = qel("div", "qz_head");
            hd.appendChild(qel("h1", "qz_title", ex.title));
            hd.appendChild(qel("p", "qz_sub", E.placeLabel(ex.stage, ex.grade) + " - " + E.examWhen(ex)));
            if (ex.description) hd.appendChild(qel("p", "qz_sub", ex.description));
            var meta = qel("div", "qz_meta");
            meta.appendChild(qel("span", "qz_chip", E.num(total) + " سؤال"));
            meta.appendChild(qel("span", "qz_chip", "اختيار من متعدد"));
            meta.appendChild(qel("span", "qz_chip", "التصحيح تلقائي بعد التسليم"));
            hd.appendChild(meta);
            return hd;
        }
        function answeredN() { return sel.filter(function (v) { return v !== -1; }).length; }
        function progress() { var n = answeredN(); progEl.textContent = "جاوبت على " + E.num(n) + " من " + E.num(total); fillEl.style.width = (n / total * 100) + "%"; }

        function card(q, i) {
            var c = qel("div", "qz_card"); c.id = "qz_q" + (i + 1);
            var g = qel("div"); g.setAttribute("role", "radiogroup"); g.setAttribute("aria-labelledby", "qz_t" + (i + 1));
            var row = qel("div", "qz_q"); row.id = "qz_t" + (i + 1);
            row.appendChild(qel("span", "qz_no", E.num(i + 1))); row.appendChild(qel("span", "", q.q));
            g.appendChild(row);
            var opts = qel("div", "qz_opts");
            q.options.forEach(function (t, oi) {
                var lb = qel("label", "qz_opt"); var inp = document.createElement("input"); inp.type = "radio"; inp.name = "q" + (i + 1); inp.value = String(oi);
                inp.addEventListener("change", function () { sel[i] = oi; progress(); });
                lb.appendChild(inp); lb.appendChild(qel("span", "qz_let", E.LETTERS[oi])); lb.appendChild(qel("span", "qz_txt", t));
                opts.appendChild(lb);
            });
            g.appendChild(opts); c.appendChild(g); cards.push(c);
            return c;
        }

        function build() {
            wrap.textContent = ""; cards = []; sel = new Array(total).fill(-1);
            wrap.appendChild(head());
            var part = null, lastSec = null;
            qs.forEach(function (q, i) {
                var sec = q.section || "";
                if (!part || sec !== lastSec) {
                    part = qel("section", "qz_part"); if (sec) part.appendChild(qel("h2", "qz_part_t", sec));
                    part.appendChild(qel("div", "qz_list")); wrap.appendChild(part); lastSec = sec;
                }
                part.lastChild.appendChild(card(q, i));
            });
            var bar = qel("div", "qz_bar"), prog = qel("div", "qz_prog"), track = qel("div", "qz_track");
            progEl = qel("div", "qz_prog_t"); fillEl = qel("div", "qz_fill"); track.appendChild(fillEl); prog.appendChild(progEl); prog.appendChild(track);
            submitBtn = qel("button", "qz_btn", "تسليم الإجابات"); submitBtn.type = "button"; submitBtn.id = "qz_submit";
            submitBtn.addEventListener("click", onSubmit);
            bar.appendChild(prog); bar.appendChild(submitBtn); wrap.appendChild(bar);
            progress();
        }

        async function onSubmit() {
            var left = total - answeredN();
            if (left > 0 && !(await E.confirmBox("لسه فيه " + E.num(left) + " سؤال من غير إجابة، وهيتحسبوا غلط. تسلّم كده؟", "سلّم الامتحان"))) return;
            submitBtn.disabled = true;
            try {
                var res = await E.call("POST", "/api/exams/" + encodeURIComponent(id) + "/submit", { answers: sel.map(function (v) { return v === -1 ? null : v; }) });
                grade(res);
            } catch (e) { E.toast(e.message || "حصل خطأ", "bad"); submitBtn.disabled = false; }
        }

        function grade(res) {
            var a = res.attempt, key = res.answerKey, wrongItems = [];
            var right = a.score, skipped = a.skipped, wrong = total - right - skipped;
            qs.forEach(function (q, i) {
                var picked = res.yourAnswers[i] === null || res.yourAnswers[i] === undefined ? -1 : res.yourAnswers[i];
                var c = cards[i], isRight = res.wrong.indexOf(i + 1) === -1;
                c.querySelectorAll(".qz_opt").forEach(function (lb, oi) {
                    lb.querySelector("input").disabled = true;
                    if (picked === oi) lb.querySelector("input").checked = true;
                    if (key) { if (oi === key[i]) lb.classList.add("is_right"); else if (oi === picked) lb.classList.add("is_wrong"); }
                    else if (oi === picked) lb.classList.add(isRight ? "is_right" : "is_wrong");
                });
                var tag;
                if (isRight) { c.classList.add("is_c_right"); tag = qel("span", "qz_tag t_right", "إجابة صح"); }
                else if (picked === -1) { c.classList.add("is_c_skip"); tag = qel("span", "qz_tag t_skip", "ما جاوبتش"); wrongItems.push({ i: i, picked: picked }); }
                else { c.classList.add("is_c_wrong"); tag = qel("span", "qz_tag t_wrong", "إجابة غلط"); wrongItems.push({ i: i, picked: picked }); }
                c.appendChild(tag);
                var why = res.explanations && res.explanations[i];
                if (why) { var p = qel("p", "qz_why"); p.appendChild(qel("b", "", "الشرح: ")); p.appendChild(document.createTextNode(why)); c.appendChild(p); }
            });
            wrap.classList.add("qz_done");
            var old = document.getElementById("qz_result"); if (old) old.remove();
            var pct = a.percent, box = qel("div", "qz_res"); box.id = "qz_result"; box.setAttribute("tabindex", "-1");
            var circle = qel("div", "qz_circle"); circle.style.setProperty("--pct", pct);
            circle.style.setProperty("--col", pct >= 75 ? "var(--ok)" : pct >= 50 ? "var(--gold)" : "var(--bad)");
            var inner = qel("div", "qz_circle_in"); inner.appendChild(qel("div", "qz_score", E.num(right) + " / " + E.num(total))); inner.appendChild(qel("div", "qz_pct", E.num(pct) + "٪"));
            circle.appendChild(inner); box.appendChild(circle);
            box.appendChild(qel("p", "qz_msg", pct === 100 ? "ممتاز! درجة كاملة 🎉" : pct >= 85 ? "جامد جدًا، كمّل كده!" : pct >= 65 ? "كويس، راجع الأسئلة الغلط وهتبقى تمام" : pct >= 50 ? "مقبول، محتاج مراجعة بسيطة للدرس" : "محتاج تذاكر الدرس تاني وتعيد المحاولة"));
            var stats = qel("div", "qz_stats");
            [["s_right", right, "إجابة صح"], ["s_wrong", wrong, "إجابة غلط"], ["s_skip", skipped, "من غير إجابة"]].forEach(function (s) {
                var d = qel("div", "qz_stat " + s[0]); d.appendChild(qel("b", "", E.num(s[1]))); d.appendChild(document.createTextNode(s[2])); stats.appendChild(d);
            });
            box.appendChild(stats);
            var wr = qel("div", "qz_wr");
            if (!wrongItems.length) wr.appendChild(qel("div", "qz_perfect", "كل إجاباتك صح، مفيش أسئلة غلط!"));
            else {
                wr.appendChild(qel("h2", "qz_wr_t", "الأسئلة اللي اتغلطت فيها (" + E.num(wrongItems.length) + ")"));
                var ul = qel("ul", "qz_wr_list");
                wrongItems.forEach(function (w) {
                    var li = qel("li", "qz_wr_item"), q = qs[w.i];
                    li.appendChild(qel("div", "qz_wr_q", "سؤال " + E.num(w.i + 1) + ": " + q.q));
                    var an = qel("div", "qz_wr_a");
                    an.appendChild(qel("span", "a_bad", w.picked === -1 ? "إجابتك: ما جاوبتش" : "إجابتك: " + E.LETTERS[w.picked] + " - " + q.options[w.picked]));
                    if (key) { an.appendChild(document.createElement("br")); an.appendChild(qel("span", "a_ok", "الإجابة الصح: " + E.LETTERS[key[w.i]] + " - " + q.options[key[w.i]])); }
                    li.appendChild(an);
                    var go = qel("button", "qz_wr_go", "اعرض السؤال"); go.type = "button";
                    go.addEventListener("click", function () { document.getElementById("qz_q" + (w.i + 1)).scrollIntoView({ behavior: "smooth", block: "center" }); });
                    li.appendChild(go); ul.appendChild(li);
                });
                wr.appendChild(ul);
            }
            box.appendChild(wr);
            var acts = qel("div", "qz_acts");
            var left = ex.maxAttempts === 0 || a.attemptNo < ex.maxAttempts;
            if (left) { var again = qel("button", "qz_btn b_dark", "إعادة المحاولة"); again.type = "button"; again.addEventListener("click", function () { location.reload(); }); acts.appendChild(again); }
            var back = qel("a", "qz_btn b_line", "رجوع للامتحانات"); back.href = "dashboard.html"; back.style.textDecoration = "none"; acts.appendChild(back);
            box.appendChild(acts);
            wrap.querySelector(".qz_head").insertAdjacentElement("afterend", box);
            progEl.textContent = "تم تسليم الامتحان"; fillEl.style.width = "100%"; submitBtn.style.display = "none";
            box.scrollIntoView({ behavior: "smooth", block: "start" }); box.focus({ preventScroll: true });
        }
        build();
        return wrap;
    }

    E.requireUser("student").then(async function (u) {
        if (!u) return;
        if (u.mustChangePassword) { location.replace("dashboard.html"); return; }
        if (!id) { fail("رابط الامتحان ناقص."); return; }
        try { data = await E.call("GET", "/api/exams/" + encodeURIComponent(id)); }
        catch (e) { fail(e.status === 404 ? "الامتحان ده مش متاح ليك." : (e.message || "حصل خطأ")); return; }
        E.clear(root);
        document.title = "الادهم - " + data.exam.title;
        if (data.questions) {
            if (data.canAttempt) { root.appendChild(typedView()); }
            else { root.appendChild(header(data.exam)); root.appendChild(doneView(data.attempts)); }
            return;
        }
        root.appendChild(header(data.exam));
        sheetCard = data.canAttempt ? sheetView() : doneView(data.attempts);
        var pages = await pagesCard(data.files);
        root.appendChild(h("div", { class: "ac_split" }, [pages, sheetCard]));
        document.title = "الادهم - " + data.exam.title;
    }).catch(function (e) { fail(e.message || "حصل خطأ"); });
})();
