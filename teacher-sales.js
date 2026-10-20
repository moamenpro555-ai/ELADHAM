// ================== لوحة المدرس: سجل المبيعات + أكواد الكورس ==================
// بيتحمّل بعد teacher.js (وبعد teacher-exams.js لو موجود)
(function () {
    "use strict";
    var ui = window.TeacherUI;
    if (!ui) return;
    var E = ui.E, h = E.h, run = ui.run;
    var filter = "pending", query = "";

    function body() { return ui.getBody(); }
    function when(d) { return d ? new Date(d).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" }) : "-"; }
    function money(n) { return E.num(n) + " ج"; }

    function setBadge(n) {
        ui.pendingSales = n;
        Array.prototype.forEach.call(document.querySelectorAll(".ac_tab"), function (t) {
            if (t.textContent.indexOf("سجل المبيعات") === 0) t.textContent = "سجل المبيعات" + (n ? " (" + E.num(n) + " جديد)" : "");
        });
    }

    // ---------- عرض الإيصال ----------
    async function showReceipt(s) {
        var dlg = h("dialog", { class: "ac_dlg" }, [h("p", { text: "إيصال " + s.studentName + " - " + money(s.amount) }), h("p", { class: "ac_empty", text: "جاري التحميل..." })]);
        document.body.appendChild(dlg);
        if (dlg.showModal) dlg.showModal();
        function close() { if (dlg.close) dlg.close(); dlg.remove(); }
        try {
            var url = await E.blobUrl("/api/teacher/sales/" + s.id + "/receipt");
            E.clear(dlg);
            dlg.appendChild(h("p", { text: "إيصال " + s.studentName + " - " + money(s.amount) + " - من محفظة " + (s.senderPhone || "-") }));
            dlg.appendChild(h("img", { class: "ac_rcpt", alt: "صورة الإيصال", src: url }));
        } catch (e) { E.clear(dlg); dlg.appendChild(h("p", { class: "ac_msg", text: e.message || "ما قدرتش أفتح الإيصال" })); }
        dlg.appendChild(h("div", { class: "ac_row", style: "margin-top:10px" }, [h("button", { type: "button", class: "ac_btn b_line", text: "إغلاق", onclick: close })]));
    }

    async function review(s, status, reason) {
        await run(async function () {
            await E.call("PATCH", "/api/teacher/sales/" + s.id, { status: status, reason: reason || "" });
            E.toast(status === "approved" ? "اتفعّل الكورس لـ " + s.studentName : "اترفض الطلب");
            await salesView();
        });
    }

    function row(s) {
        var st = s.status === "pending" ? h("span", { class: "ac_pill p_wait", text: "مستني المراجعة" }) : s.status === "approved" ? h("span", { class: "ac_pill p_ok", text: "تم التفعيل" }) : h("span", { class: "ac_pill p_bad", text: "مرفوض" });
        var acts = [];
        if (s.hasReceipt) acts.push(h("button", { type: "button", class: "ac_btn b_line b_sm", text: "عرض الإيصال", onclick: function () { showReceipt(s); } }));
        if (s.status === "pending") {
            acts.push(h("button", { type: "button", class: "ac_btn b_gold b_sm", text: "تأكيد وتفعيل الكورس", onclick: async function () {
                if (await E.confirmBox("اتأكدت من الإيصال ومبلغ " + money(s.amount) + "؟ هيتفعّل «" + s.courseTitle + "» لـ " + s.studentName + ".", "فعّل")) review(s, "approved");
            } }));
            acts.push(h("button", { type: "button", class: "ac_btn b_bad b_sm", text: "رفض", onclick: function () {
                var reason = window.prompt("سبب الرفض (هيظهر للطالب):", "") ; if (reason === null) return; review(s, "rejected", reason.trim());
            } }));
        }
        var how = s.method === "code" ? "كود" + (s.code ? " (" + s.code + ")" : "") : "فودافون كاش";
        return h("tr", { "data-sale": s.id }, [
            h("td", { text: s.studentName }),
            h("td", null, [h("div", { dir: "ltr", text: s.studentPhone || s.studentEmail }), h("small", { text: (s.studentCode ? "كود #" + s.studentCode : "") + (s.guardianPhone ? " | ولي الأمر: " + s.guardianPhone : "") })]),
            h("td", { text: s.courseTitle }), h("td", { text: s.amount > 0 ? money(s.amount) : "-" }), h("td", { text: how }),
            h("td", { text: when(s.createdAt) }), h("td", null, [st, s.status === "rejected" && s.rejectReason ? h("small", { text: " " + s.rejectReason }) : null]),
            h("td", null, [h("div", { class: "ac_row" }, acts)])
        ]);
    }

    async function salesView() {
        E.clear(body());
        var d = null;
        await run(async function () { d = await E.call("GET", "/api/teacher/sales?status=" + (filter === "all" ? "" : filter) + (query ? "&q=" + encodeURIComponent(query) : "")); });
        if (!d) return;
        setBadge(d.summary.pending);
        var filters = [["pending", "مستني المراجعة"], ["approved", "تم التفعيل"], ["rejected", "مرفوض"], ["all", "الكل"]];
        var bar = h("div", { class: "ac_tabs", role: "tablist" }, filters.map(function (f) {
            return h("button", { type: "button", class: "ac_tab", role: "tab", "aria-selected": String(filter === f[0]), text: f[1], onclick: function () { filter = f[0]; salesView(); } });
        }));
        var search = h("input", { class: "ac_in", type: "search", placeholder: "ابحث بالاسم أو التليفون أو الكود أو الكورس", value: query, "aria-label": "بحث" });
        var timer = 0;
        search.addEventListener("input", function () { window.clearTimeout(timer); timer = window.setTimeout(function () { query = search.value.trim(); salesView(); }, 400); });
        var sum = h("div", { class: "ac_statbox" }, [
            h("div", { class: "ac_stat" }, [h("b", { text: E.num(d.summary.pending) }), "طلبات مستنية"]),
            h("div", { class: "ac_stat" }, [h("b", { text: money(d.summary.vodafoneTotal) }), "إجمالي فودافون كاش المؤكد"]),
            h("div", { class: "ac_stat" }, [h("b", { text: E.num(d.summary.codeCount) }), "اشتراكات بالكود"])
        ]);
        var card = h("div", { class: "ac_card" }, [h("h2", { class: "ac_h2", text: "سجل المبيعات" }),
            h("p", { class: "ac_sub", text: "كل اشتراك: اسم الطالب وحسابه والكورس والسعر وطريقة الدفع. افتح صورة الإيصال وتأكد من المبلغ والرقم، وبعدها فعّل الكورس." }), sum, bar, search]);
        if (!d.sales.length) card.appendChild(h("p", { class: "ac_empty", text: query ? "مفيش نتايج." : "مفيش مبيعات هنا لسه." }));
        else card.appendChild(h("div", { class: "ac_tablewrap" }, [h("table", { class: "ac_table", style: "min-width:900px" }, [
            h("thead", null, [h("tr", null, ["الطالب", "حسابه", "الكورس", "السعر", "طريقة الدفع", "التاريخ", "الحالة", ""].map(function (t) { return h("th", { text: t }); }))]),
            h("tbody", null, d.sales.map(row))
        ])]));
        body().appendChild(card);
    }
    ui.views.sales = salesView;

    // ---------- كارت الأكواد جوه إدارة الكورس ----------
    ui.courseCards.push(function (course) {
        if (course.accessMode !== "code" && course.accessMode !== "code_or_paid") return null;
        var box = h("div", { class: "ac_card", id: "codes_card" }, [h("h2", { class: "ac_h2", text: "أكواد الاشتراك" }),
            h("p", { class: "ac_sub", text: "كل كود يتستخدم مرة واحدة بس. اعمل كود لكل طالب ادفع وادّيه له." })]);
        var list = h("div", { id: "codes_list" }), msg = h("p", { class: "ac_msg", role: "alert" });
        var count = h("input", { id: "cd_count", type: "number", min: "1", max: "100", value: "1", style: "max-width:90px" });
        var note = h("input", { id: "cd_note", maxlength: "100", placeholder: "ملاحظة (اسم الطالب مثلًا)" });
        var gen = h("button", { type: "button", class: "ac_btn b_dark", id: "cd_gen", text: "اعمل أكواد" });
        function copyText(t, b) { if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { var o = b.textContent; b.textContent = "اتنسخ ✓"; setTimeout(function () { b.textContent = o; }, 1200); }, function () {}); }
        async function refresh() {
            var d;
            try { d = await E.call("GET", "/api/teacher/courses/" + course.id + "/codes"); } catch (e) { msg.textContent = e.message; return; }
            E.clear(list);
            if (!d.codes.length) { list.appendChild(h("p", { class: "ac_empty", text: "مفيش أكواد لسه." })); return; }
            list.appendChild(h("div", { class: "ac_tablewrap" }, [h("table", { class: "ac_table" }, [
                h("thead", null, [h("tr", null, ["الكود", "ملاحظة", "الحالة", ""].map(function (t) { return h("th", { text: t }); }))]),
                h("tbody", null, d.codes.map(function (k) {
                    var cb = h("button", { type: "button", class: "ac_btn b_line b_sm", text: "نسخ" });
                    cb.addEventListener("click", function () { copyText(k.code, cb); });
                    var acts = [cb];
                    if (!k.used) acts.push(h("button", { type: "button", class: "ac_btn b_bad b_sm", text: "حذف", onclick: function () { run(async function () { await E.call("DELETE", "/api/teacher/codes/" + k.id); await refresh(); }); } }));
                    return h("tr", null, [h("td", { class: "ac_codes", text: k.code }), h("td", { text: k.note || "-" }),
                        h("td", { text: k.used ? "اتستخدم: " + (k.redeemer || "") + (k.redeemerCode ? " (#" + k.redeemerCode + ")" : "") : "متاح" }), h("td", null, [h("div", { class: "ac_row" }, acts)])]);
                }))
            ])]));
        }
        gen.addEventListener("click", async function () {
            msg.textContent = "";
            var n = Number(count.value);
            if (!(n >= 1 && n <= 100)) { msg.textContent = "العدد من 1 لـ 100."; return; }
            gen.disabled = true;
            await run(async function () { await E.call("POST", "/api/teacher/courses/" + course.id + "/codes", { count: n, note: note.value.trim() }); note.value = ""; await refresh(); });
            gen.disabled = false;
        });
        box.appendChild(h("div", { class: "ac_row" }, [count, note, gen]));
        box.appendChild(msg); box.appendChild(list);
        refresh();
        return box;
    });

    // عدّاد الطلبات الجديدة على التبويب من أول ما اللوحة تفتح
    E.call("GET", "/api/teacher/sales?status=pending").then(function (d) { setBadge(d.summary.pending); }, function () {});
})();
