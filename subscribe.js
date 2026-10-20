// صفحة الاشتراك في كورس: مجاني / كود / فودافون كاش (مع رفع صورة الإيصال)
(function () {
    "use strict";
    var E = window.Eladham, h = E.h;
    var root = document.getElementById("ac_root");
    var id = new URLSearchParams(location.search).get("course");
    function latin(s) { return String(s).replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); }); }

    function fail(m) { E.clear(root); root.appendChild(h("div", { class: "ac_card" }, [h("p", { class: "ac_msg", text: m }), h("a", { class: "ac_btn b_line", href: "dashboard.html", text: "رجوع لحسابي" })])); }

    async function load() {
        var d;
        try { d = await E.call("GET", "/api/courses/" + encodeURIComponent(id) + "/offer"); }
        catch (e) { fail(e.message || "الكورس مش متاح"); return; }
        render(d);
    }

    function render(d) {
        var c = d.course;
        E.clear(root);
        var head = [];
        if (c.hasCover) head.push(h("img", { class: "ac_cardimg", alt: "", src: String(window.ELADHAM_API || "").replace(/\/$/, "") + "/api/public/courses/" + encodeURIComponent(c.id) + "/cover" }));
        head.push(h("h1", { class: "ac_h1", text: c.title }));
        if (c.description) head.push(h("p", { class: "ac_sub", text: c.description }));
        head.push(h("p", { class: "ac_sub", text: E.courseLabel(c) + " - " + E.num(c.lessonCount) + " درس" }));
        if (c.accessMode !== "free" && c.accessMode !== "code") head.push(h("p", { class: "ac_h2", text: "السعر: " + E.num(c.price) + " جنيه" }));
        root.appendChild(h("div", { class: "ac_card" }, head));

        if (d.enrolled) {
            root.appendChild(h("div", { class: "ac_card" }, [h("p", { class: "ac_pill p_ok", text: "إنت مشترك في الكورس ده" }),
                h("a", { class: "ac_btn b_dark", id: "sb_open", href: "dashboard.html?course=" + encodeURIComponent(c.id), text: "افتح الكورس" })]));
            return;
        }
        var opts = [];
        var m = c.accessMode;
        var p = d.purchase;
        if (p && p.method === "vodafone" && p.status === "pending") {
            root.appendChild(h("div", { class: "ac_card" }, [h("p", { class: "ac_pill", id: "sb_pending", text: "طلب الدفع بتاعك لسه بيتراجع" }),
                h("p", { class: "ac_sub", text: "المدرس هيراجع صورة الإيصال ويفعّل الكورس. حدّث الصفحة بعد شوية." })]));
            return;
        }
        if (p && p.method === "vodafone" && p.status === "rejected") {
            root.appendChild(h("div", { class: "ac_banner", id: "sb_rejected", text: "طلب الدفع السابق اترفض" + (p.rejectReason ? ": " + p.rejectReason : "") + ". تقدر تبعت طلب جديد." }));
        }
        if (m === "free") opts.push(freeBox(c));
        if (m === "code" || m === "code_or_paid") opts.push(codeBox(c));
        if ((m === "paid" || m === "code_or_paid") && d.payment) opts.push(payBox(c, d.payment));
        if (!opts.length) opts.push(h("p", { class: "ac_msg", text: "الاشتراك في الكورس ده مش متاح دلوقتي." }));
        if (opts.length > 1) root.appendChild(h("div", { class: "ac_card" }, [h("p", { class: "ac_sub", text: "اختار طريقة الاشتراك:" })]));
        opts.forEach(function (o) { root.appendChild(o); });
    }

    function box(title, kids) { return h("div", { class: "ac_card ac_choice" }, [h("h2", { class: "ac_h2", text: title })].concat(kids)); }

    function freeBox(c) {
        var msg = h("p", { class: "ac_msg", role: "alert" });
        var b = h("button", { type: "button", class: "ac_btn b_dark", id: "sb_free", text: "اشترك مجانًا" });
        b.addEventListener("click", async function () {
            b.disabled = true;
            try { await E.call("POST", "/api/courses/" + encodeURIComponent(c.id) + "/enroll-free"); location.href = "dashboard.html?course=" + encodeURIComponent(c.id); }
            catch (e) { msg.textContent = e.message; b.disabled = false; }
        });
        return box("كورس مجاني", [b, msg]);
    }

    function codeBox(c) {
        var code = h("input", { id: "sb_code", class: "ac_codebox", maxlength: "20", autocomplete: "off", placeholder: "XXXX-XXXX-XXXX", dir: "ltr" });
        var msg = h("p", { class: "ac_msg", role: "alert" });
        var b = h("button", { type: "submit", class: "ac_btn b_dark", id: "sb_redeem", text: "فعّل الكود" });
        var f = h("form", { class: "ac_form", novalidate: true }, [h("label", { for: "sb_code", text: "الكود اللي المدرس أداهولك" }), code, msg, b]);
        f.addEventListener("submit", async function (ev) {
            ev.preventDefault(); msg.textContent = "";
            if (latin(code.value).replace(/[^A-Za-z0-9]/g, "").length !== 12) { msg.textContent = "الكود 12 حرف ورقم."; return; }
            b.disabled = true;
            try { await E.call("POST", "/api/courses/" + encodeURIComponent(c.id) + "/redeem", { code: latin(code.value) }); location.href = "dashboard.html?course=" + encodeURIComponent(c.id); }
            catch (e) { msg.textContent = e.message; b.disabled = false; }
        });
        return box("الدفع عن طريق كود", [f]);
    }

    function payBox(c, pay) {
        var sender = h("input", { id: "sb_sender", type: "tel", inputmode: "numeric", dir: "ltr", maxlength: "11", placeholder: "01012345678" });
        var file = h("input", { id: "sb_file", type: "file", accept: "image/png,image/jpeg,image/webp" });
        var prev = h("img", { class: "ac_preview", alt: "معاينة الإيصال", style: "display:none" });
        var msg = h("p", { class: "ac_msg", role: "alert" });
        var b = h("button", { type: "submit", class: "ac_btn b_dark", id: "sb_send", text: "إرسال الإيصال" });
        file.addEventListener("change", function () {
            var f = file.files && file.files[0];
            if (!f) { prev.style.display = "none"; return; }
            prev.src = URL.createObjectURL(f); prev.style.display = "";
        });
        var form = h("form", { class: "ac_form", novalidate: true }, [
            h("label", { for: "sb_sender", text: "رقم المحفظة اللي حوّلت منها" }), sender,
            h("label", { for: "sb_file", text: "صورة إيصال التحويل" }), file, prev, msg, b]);
        form.addEventListener("submit", async function (ev) {
            ev.preventDefault(); msg.textContent = "";
            var ph = latin(sender.value).replace(/\D/g, "");
            if (!/^01[0125]\d{8}$/.test(ph)) { msg.textContent = "اكتب رقم المحفظة صح (11 رقم)."; return; }
            var f = file.files && file.files[0];
            if (!f) { msg.textContent = "اختار صورة الإيصال."; return; }
            if (f.size > 6 * 1024 * 1024) { msg.textContent = "الصورة أكبر من 6 ميجا."; return; }
            b.disabled = true;
            try { await E.upload("POST", "/api/courses/" + encodeURIComponent(c.id) + "/purchase?phone=" + ph, f); load(); }
            catch (e) { msg.textContent = e.message || "فشل الإرسال"; b.disabled = false; }
        });
        return box("الدفع عن طريق فودافون كاش", [
            h("p", { class: "ac_sub", text: "حوّل مبلغ " + E.num(pay.amount) + " جنيه على الرقم ده:" }),
            h("div", { class: "ac_num", id: "sb_number", text: pay.vodafoneNumber }),
            pay.studentCode ? h("p", { class: "ac_sub", text: "اكتب كود الطالب بتاعك (#" + pay.studentCode + ") في ملاحظات التحويل لو أمكن." }) : null,
            h("p", { class: "ac_sub", text: "بعد التحويل ارفع صورة الإيصال هنا. المدرس هيتأكد من البيانات ويفعّل الكورس." }),
            form]);
    }

    E.requireUser("student").then(function (u) {
        if (!u) return;
        if (u.mustChangePassword) { location.replace("dashboard.html"); return; }
        if (!id || !/^[0-9a-f-]{36}$/i.test(id)) { fail("رابط الكورس غير صحيح."); return; }
        return load();
    }).catch(function (e) { fail(e.message || "حصل خطأ"); });
})();
