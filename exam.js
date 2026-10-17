// ================== صفحة الامتحان التفاعلي ==================
// الصفحة بتقرا رقم الامتحان من الرابط (exam.html?e=sec_4_8_1) وتجيب أسئلته من exams-data.js
// وبعد ما الطالب يدوس "تسليم" بتصحح وتعرض الدرجة وعدد الصح والغلط والأسئلة الغلط.

(function () {
    "use strict";

    var LETTERS = ["أ", "ب", "ج", "د"];
    var STAGES = { prep: "اعدادي", sec: "ثانوي" };
    var YEARS = { "4": "الأولى", "6": "التانية", "8": "التالتة" };
    var PARTS = { "7": "امتحانات الشهر", "8": "امتحانات الحصة" };
    var MONTHS = ["أكتوبر", "نوفمبر", "ديسمبر"];
    var LESSONS = ["الأولى", "الثانية", "الثالثة"];
    var BACK_PAGE = { prep: "index3.html", sec: "index4.html" };

    var root = document.getElementById("qz_root");
    var dlg = document.getElementById("qz_dlg");
    var id = new URLSearchParams(location.search).get("e") || "";
    var exam = (window.EXAMS || {})[id];

    // ---------- دوال صغيرة ----------
    function el(tag, cls, text) {
        var node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text !== undefined) node.textContent = text;
        return node;
    }
    function num(n) {
        return Number(n).toLocaleString("ar-EG");
    }
    function backHref() {
        if (exam && exam.back) return exam.back;
        var stage = id.split("_")[0];
        return BACK_PAGE[stage] || "index2.html";
    }
    // اسم مفهوم للامتحان من المفتاح (لما الامتحان لسه ماتضافش)
    function labelFromId() {
        var p = id.split("_"); // stage _ year _ section _ n
        if (p.length !== 4 || !STAGES[p[0]] || !YEARS[p[1]] || !PARTS[p[2]]) return "";
        var n = Number(p[3]) - 1;
        var what = p[2] === "7" ? "امتحان شهر " + (MONTHS[n] || "") : "امتحان الحصة " + (LESSONS[n] || "");
        return what.trim() + " - " + YEARS[p[1]] + " " + STAGES[p[0]];
    }

    // ---------- امتحان مش موجود ----------
    function renderMissing() {
        var label = labelFromId();
        document.title = "الادهم - امتحان";
        var box = el("div", "qz_na");
        box.appendChild(el("p", "", "الامتحان ده لسه مش متاح"));
        box.appendChild(el("small", "", label ? label : "الرابط مش صحيح، ارجع واختار الامتحان من القايمة."));
        var back = el("a", "qz_btn b_dark", "رجوع للامتحانات");
        back.href = backHref();
        back.style.display = "inline-block";
        back.style.textDecoration = "none";
        box.appendChild(back);
        root.appendChild(box);
    }

    if (!exam) {
        renderMissing();
        return;
    }

    // ---------- تجهيز الأسئلة (ترقيم واحد متصل للامتحان كله) ----------
    var all = [];
    exam.sections.forEach(function (sec, si) {
        sec.questions.forEach(function (q) {
            all.push({ q: q, section: si, no: all.length + 1 });
        });
    });
    var total = all.length;
    document.title = "الادهم - " + exam.title;

    // ---------- بناء الصفحة ----------
    var cards = [];
    var bar, fillEl, progEl, submitBtn;

    function build() {
        root.textContent = "";
        root.classList.remove("qz_done");
        cards = [];

        // رأس الامتحان
        var head = el("div", "qz_head");
        head.appendChild(el("h1", "qz_title", exam.title));
        if (exam.subtitle) head.appendChild(el("p", "qz_sub", exam.subtitle));
        var meta = el("div", "qz_meta");
        meta.appendChild(el("span", "qz_chip", num(total) + " سؤال"));
        meta.appendChild(el("span", "qz_chip", "اختيار من متعدد"));
        meta.appendChild(el("span", "qz_chip", "التصحيح تلقائي بعد التسليم"));
        head.appendChild(meta);
        root.appendChild(head);

        // الأجزاء والأسئلة
        var cursor = 0;
        exam.sections.forEach(function (sec) {
            var part = el("section", "qz_part");
            if (sec.title) part.appendChild(el("h2", "qz_part_t", sec.title));
            var list = el("div", "qz_list");
            sec.questions.forEach(function () {
                var item = all[cursor++];
                list.appendChild(buildCard(item));
            });
            part.appendChild(list);
            root.appendChild(part);
        });

        // شريط التسليم
        bar = el("div", "qz_bar");
        progEl = el("div", "qz_prog_t");
        fillEl = el("div", "qz_fill");
        var track = el("div", "qz_track");
        track.appendChild(fillEl);
        var prog = el("div", "qz_prog");
        prog.appendChild(progEl);
        prog.appendChild(track);
        submitBtn = el("button", "qz_btn", "تسليم الإجابات");
        submitBtn.type = "button";
        submitBtn.addEventListener("click", onSubmit);
        bar.appendChild(prog);
        bar.appendChild(submitBtn);
        root.appendChild(bar);
        updateProgress();
    }

    function buildCard(item) {
        var card = el("div", "qz_card");
        card.id = "qz_q" + item.no;
        var group = el("div", "");
        group.setAttribute("role", "radiogroup");
        var qid = "qz_t" + item.no;
        group.setAttribute("aria-labelledby", qid);

        var qrow = el("div", "qz_q");
        qrow.id = qid;
        qrow.appendChild(el("span", "qz_no", num(item.no)));
        qrow.appendChild(el("span", "", item.q.q));
        group.appendChild(qrow);

        var opts = el("div", "qz_opts");
        item.q.options.forEach(function (text, oi) {
            var label = el("label", "qz_opt");
            var input = document.createElement("input");
            input.type = "radio";
            input.name = "q" + item.no;
            input.value = String(oi);
            input.addEventListener("change", updateProgress);
            label.appendChild(input);
            label.appendChild(el("span", "qz_let", LETTERS[oi]));
            label.appendChild(el("span", "qz_txt", text));
            opts.appendChild(label);
        });
        group.appendChild(opts);
        card.appendChild(group);
        cards.push(card);
        return card;
    }

    // ---------- قراءة إجابات الطالب ----------
    function pickedOf(no) {
        var checked = root.querySelector('input[name="q' + no + '"]:checked');
        return checked ? Number(checked.value) : -1;
    }
    function answeredCount() {
        var n = 0;
        all.forEach(function (item) { if (pickedOf(item.no) !== -1) n++; });
        return n;
    }
    function updateProgress() {
        var n = answeredCount();
        progEl.textContent = "جاوبت على " + num(n) + " من " + num(total);
        fillEl.style.width = (n / total * 100) + "%";
    }

    // ---------- التسليم ----------
    function onSubmit() {
        var left = total - answeredCount();
        if (left === 0) return grade();
        document.getElementById("qz_dlg_t").textContent =
            "لسه فيه " + num(left) + " سؤال من غير إجابة، وهيتحسبوا غلط. تسلّم كده؟";
        if (typeof dlg.showModal === "function") {
            dlg.showModal();
        } else if (window.confirm("لسه فيه " + left + " سؤال من غير إجابة. تسلّم كده؟")) {
            grade();
        }
    }
    document.getElementById("qz_dlg_yes").addEventListener("click", function () {
        dlg.close();
        grade();
    });
    document.getElementById("qz_dlg_no").addEventListener("click", function () {
        dlg.close();
        var first = all.filter(function (it) { return pickedOf(it.no) === -1; })[0];
        if (first) document.getElementById("qz_q" + first.no).scrollIntoView({ behavior: "smooth", block: "center" });
    });

    // ---------- التصحيح ----------
    function grade() {
        var right = 0, wrong = 0, skipped = 0;
        var wrongItems = [];

        all.forEach(function (item) {
            var picked = pickedOf(item.no);
            var correct = item.q.answer;
            var card = cards[item.no - 1];

            var opts = card.querySelectorAll(".qz_opt");
            opts.forEach(function (label, oi) {
                label.querySelector("input").disabled = true;
                if (oi === correct) label.classList.add("is_right");
                else if (oi === picked) label.classList.add("is_wrong");
            });

            var tag;
            if (picked === correct) {
                right++;
                card.classList.add("is_c_right");
                tag = el("span", "qz_tag t_right", "إجابة صح");
            } else if (picked === -1) {
                skipped++;
                card.classList.add("is_c_skip");
                tag = el("span", "qz_tag t_skip", "ما جاوبتش");
                wrongItems.push({ item: item, picked: picked });
            } else {
                wrong++;
                card.classList.add("is_c_wrong");
                tag = el("span", "qz_tag t_wrong", "إجابة غلط");
                wrongItems.push({ item: item, picked: picked });
            }
            card.appendChild(tag);

            if (item.q.why) {
                var why = el("p", "qz_why");
                why.appendChild(el("b", "", "الشرح: "));
                why.appendChild(document.createTextNode(item.q.why));
                card.appendChild(why);
            }
        });

        root.classList.add("qz_done");
        showResult(right, wrong, skipped, wrongItems);
        showDoneBar();
    }

    function showResult(right, wrong, skipped, wrongItems) {
        var pct = Math.round(right / total * 100);
        var old = document.getElementById("qz_result");
        if (old) old.remove();

        var box = el("div", "qz_res");
        box.id = "qz_result";
        box.setAttribute("tabindex", "-1");

        var circle = el("div", "qz_circle");
        circle.style.setProperty("--pct", pct);
        circle.style.setProperty("--col", pct >= 75 ? "var(--ok)" : pct >= 50 ? "var(--gold)" : "var(--bad)");
        var inner = el("div", "qz_circle_in");
        inner.appendChild(el("div", "qz_score", num(right) + " / " + num(total)));
        inner.appendChild(el("div", "qz_pct", num(pct) + "٪"));
        circle.appendChild(inner);
        box.appendChild(circle);

        var msg = pct === 100 ? "ممتاز! درجة كاملة 🎉"
            : pct >= 85 ? "جامد جدًا، كمّل كده!"
            : pct >= 65 ? "كويس، راجع الأسئلة الغلط وهتبقى تمام"
            : pct >= 50 ? "مقبول، محتاج مراجعة بسيطة للدرس"
            : "محتاج تذاكر الدرس تاني وتعيد المحاولة";
        box.appendChild(el("p", "qz_msg", msg));

        var stats = el("div", "qz_stats");
        [["s_right", right, "إجابة صح"], ["s_wrong", wrong, "إجابة غلط"], ["s_skip", skipped, "من غير إجابة"]].forEach(function (s) {
            var d = el("div", "qz_stat " + s[0]);
            d.appendChild(el("b", "", num(s[1])));
            d.appendChild(document.createTextNode(s[2]));
            stats.appendChild(d);
        });
        box.appendChild(stats);

        var wr = el("div", "qz_wr");
        if (wrongItems.length === 0) {
            wr.appendChild(el("div", "qz_perfect", "كل إجاباتك صح، مفيش أسئلة غلط!"));
        } else {
            wr.appendChild(el("h2", "qz_wr_t", "الأسئلة اللي اتغلطت فيها (" + num(wrongItems.length) + ")"));
            var ul = el("ul", "qz_wr_list");
            wrongItems.forEach(function (w) {
                var li = el("li", "qz_wr_item");
                li.appendChild(el("div", "qz_wr_q", "سؤال " + num(w.item.no) + ": " + w.item.q.q));
                var a = el("div", "qz_wr_a");
                var mine = el("span", "a_bad", w.picked === -1
                    ? "إجابتك: ما جاوبتش"
                    : "إجابتك: " + LETTERS[w.picked] + " - " + w.item.q.options[w.picked]);
                var ok = el("span", "a_ok", "الإجابة الصح: " + LETTERS[w.item.q.answer] + " - " + w.item.q.options[w.item.q.answer]);
                a.appendChild(mine);
                a.appendChild(document.createElement("br"));
                a.appendChild(ok);
                li.appendChild(a);
                var go = el("button", "qz_wr_go", "اعرض السؤال");
                go.type = "button";
                go.addEventListener("click", function () {
                    document.getElementById("qz_q" + w.item.no).scrollIntoView({ behavior: "smooth", block: "center" });
                });
                li.appendChild(go);
                ul.appendChild(li);
            });
            wr.appendChild(ul);
        }
        box.appendChild(wr);

        var acts = el("div", "qz_acts");
        var again = el("button", "qz_btn b_dark", "إعادة المحاولة");
        again.type = "button";
        again.addEventListener("click", retry);
        var back = el("a", "qz_btn b_line", "رجوع للامتحانات");
        back.href = backHref();
        back.style.textDecoration = "none";
        acts.appendChild(again);
        acts.appendChild(back);
        box.appendChild(acts);

        // النتيجة بتتحط بعد رأس الامتحان على طول
        var head = root.querySelector(".qz_head");
        head.insertAdjacentElement("afterend", box);
        box.scrollIntoView({ behavior: "smooth", block: "start" });
        box.focus({ preventScroll: true });
    }

    function showDoneBar() {
        progEl.textContent = "تم تسليم الامتحان";
        fillEl.style.width = "100%";
        submitBtn.textContent = "إعادة المحاولة";
        submitBtn.removeEventListener("click", onSubmit);
        submitBtn.addEventListener("click", retry);
    }

    function retry() {
        build();
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    build();
})();
