(function () {
    "use strict";
    var E = window.Eladham, h = E.h;
    var root = document.getElementById("ac_reg_root");
    var GOVS = ["القاهرة", "الإسكندرية", "بورسعيد", "السويس", "دمياط", "الدقهلية", "الشرقية", "القليوبية", "كفر الشيخ", "الغربية", "المنوفية", "البحيرة", "الإسماعيلية", "الجيزة", "بني سويف", "الفيوم", "المنيا", "أسيوط", "سوهاج", "قنا", "أسوان", "الأقصر", "البحر الأحمر", "الوادي الجديد", "مطروح", "شمال سيناء", "جنوب سيناء"];
    var GRADES_BY_STAGE = { primary: [4, 5, 6], prep: [1, 2, 3], secondary: [1, 2, 3] };
    // لو الطالب كتب الرقم بكيبورد عربي نحوّله لأرقام إنجليزي
    function latin(s) { return String(s).replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); }).replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); }); }

    function field(label, id, input) { return [h("label", { for: id, text: label }), input]; }

    var intro = Array.prototype.slice.call(root.children);

    function option(v, t) { return h("option", { value: String(v), text: t }); }

    var name = h("input", { id: "rg_name", maxlength: "120", autocomplete: "name", required: true });
    var phone = h("input", { id: "rg_phone", type: "tel", inputmode: "numeric", dir: "ltr", maxlength: "11", autocomplete: "tel", placeholder: "01012345678", required: true });
    var gphone = h("input", { id: "rg_gphone", type: "tel", inputmode: "numeric", dir: "ltr", maxlength: "11", autocomplete: "off", placeholder: "01012345678", required: true });
    var gov = h("select", { id: "rg_gov" }, [option("", "اختار المحافظة")].concat(GOVS.map(function (g) { return option(g, g); })));
    var addr = h("input", { id: "rg_addr", maxlength: "250", autocomplete: "street-address", placeholder: "الشارع - المنطقة - المدينة", required: true });
    var stage = h("select", { id: "rg_stage" }, [option("", "اختار المرحلة"), option("primary", "ابتدائي"), option("prep", "إعدادي"), option("secondary", "ثانوي")]);
    var grade = h("select", { id: "rg_grade", disabled: true }, [option("", "اختار المرحلة الأول")]);
    var email = h("input", { id: "rg_email", dir: "ltr", maxlength: "40", autocomplete: "off", placeholder: "اسمك بالإنجليزي مثلا ahmed.ali", required: true });
    var emailBox = h("div", { class: "ac_emailbox", dir: "ltr" }, [email, h("span", { class: "ac_suffix", text: "@eladham.com" })]);
    // حقل فخ للروبوتات: الإنسان مش بيشوفه
    var trap = h("input", { id: "rg_web", name: "website", tabindex: "-1", autocomplete: "off", "aria-hidden": "true", class: "ac_trap" });
    var msg = h("p", { class: "ac_msg", role: "alert" });
    var go = h("button", { type: "submit", class: "ac_btn b_dark", text: "إنشاء الحساب" });

    stage.addEventListener("change", function () {
        E.clear(grade);
        var list = GRADES_BY_STAGE[stage.value];
        if (!list) { grade.appendChild(option("", "اختار المرحلة الأول")); grade.disabled = true; return; }
        grade.disabled = false;
        grade.appendChild(option("", "اختار الصف"));
        list.forEach(function (g) { grade.appendChild(option(g, "الصف " + E.GRADES[g])); });
    });
    function digits(i) { i.addEventListener("input", function () { i.value = latin(i.value).replace(/\D/g, "").slice(0, 11); }); }
    digits(phone); digits(gphone);
    email.addEventListener("input", function () { email.value = email.value.toLowerCase().replace(/@.*$/, "").replace(/[^a-z0-9._-]/g, ""); });

    var form = h("form", { class: "ac_form", novalidate: true, id: "ac_register" }, [].concat(
        field("الاسم (ثلاثي)", "rg_name", name), field("رقم تليفون الطالب (هو اسم المستخدم)", "rg_phone", phone), field("رقم تليفون ولي الأمر", "rg_gphone", gphone),
        field("المحافظة", "rg_gov", gov), field("العنوان", "rg_addr", addr),
        field("المرحلة الدراسية", "rg_stage", stage), field("الصف الدراسي", "rg_grade", grade),
        field("الإيميل (اكتب الجزء الأول بس)", "rg_email", emailBox), [trap, msg, go]));

    form.addEventListener("submit", async function (ev) {
        ev.preventDefault(); msg.textContent = "";
        if (name.value.trim().length < 3) { msg.textContent = "اكتب اسمك."; name.focus(); return; }
        if (!/^01[0125]\d{8}$/.test(phone.value)) { msg.textContent = "اكتب رقم تليفونك صح (11 رقم بيبدأ بـ 01)."; phone.focus(); return; }
        if (!/^01[0125]\d{8}$/.test(gphone.value)) { msg.textContent = "اكتب رقم تليفون ولي الأمر صح (11 رقم بيبدأ بـ 01)."; gphone.focus(); return; }
        if (phone.value === gphone.value) { msg.textContent = "رقم ولي الأمر لازم يختلف عن رقمك."; gphone.focus(); return; }
        if (!gov.value) { msg.textContent = "اختار المحافظة."; gov.focus(); return; }
        if (addr.value.trim().length < 5) { msg.textContent = "اكتب عنوانك."; addr.focus(); return; }
        if (!stage.value || !grade.value) { msg.textContent = "اختار المرحلة والصف."; return; }
        if (!/^[a-z0-9][a-z0-9._-]{2,38}$/.test(email.value)) { msg.textContent = "اسم الإيميل: حروف إنجليزي وأرقام (3 على الأقل)."; email.focus(); return; }
        go.disabled = true;
        try {
            var d = await E.call("POST", "/api/auth/register", {
                name: name.value.trim(), phone: phone.value, guardianPhone: gphone.value, emailName: email.value, governorate: gov.value, address: addr.value.trim(),
                stage: stage.value, grade: Number(grade.value), website: trap.value
            });
            done(d.account);
        } catch (e) {
            msg.textContent = e.message || "حصل خطأ، جرّب تاني.";
            go.disabled = false;
        }
    });
    root.appendChild(form);

    function copy(text, btn) {
        function ok() { var t = btn.textContent; btn.textContent = "اتنسخ ✓"; window.setTimeout(function () { btn.textContent = t; }, 1500); }
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, function () {});
    }

    // شاشة النجاح: كلمة السر بتظهر هنا مرة واحدة بس
    function done(a) {
        E.clear(root);
        var em = h("code", { text: a.email, dir: "ltr" });
        var u = h("code", { text: a.username, dir: "ltr" }), p = h("code", { text: a.password, dir: "ltr" });
        var cu = h("button", { type: "button", class: "ac_btn b_line b_sm", text: "نسخ" }), cp = h("button", { type: "button", class: "ac_btn b_line b_sm", text: "نسخ" });
        cu.addEventListener("click", function () { copy(a.username, cu); }); cp.addEventListener("click", function () { copy(a.password, cp); });
        var ack = h("input", { type: "checkbox", id: "rg_ack" });
        var next = h("a", { class: "ac_btn b_dark ac_disabled", href: "login.html", text: "الذهاب لتسجيل الدخول", "aria-disabled": "true" });
        ack.addEventListener("change", function () { next.classList.toggle("ac_disabled", !ack.checked); next.setAttribute("aria-disabled", String(!ack.checked)); });
        next.addEventListener("click", function (e) { if (!ack.checked) e.preventDefault(); });
        root.appendChild(h("h1", { class: "ac_h1", text: "تم التسجيل يا " + a.name.split(" ")[0] }));
        root.appendChild(h("div", { class: "ac_regok" }, [
            h("p", { class: "ac_sub", text: "كود الطالب بتاعك: #" + a.studentCode }),
            h("p", { class: "ac_sub", text: "اسم المستخدم (رقم تليفونك)" }), h("div", { class: "ac_secret" }, [u, cu]),
            h("p", { class: "ac_sub", text: "إيميلك (تقدر تدخل بيه برضو)" }), h("div", { class: "ac_secret" }, [em]),
            h("p", { class: "ac_sub", text: "كلمة السر (بتظهر مرة واحدة بس)" }), h("div", { class: "ac_secret" }, [p, cp])
        ]));
        root.appendChild(h("p", { class: "ac_msg", text: "احفظ كلمة السر دلوقتي (صوّر الشاشة أو انسخها). لو ضاعت هتحتاج المدرس يعملك رابط جديد." }));
        root.appendChild(h("p", { class: "ac_sub", text: "حسابك مستني موافقة المدرس. أول ما يفعّله ادخل بالبيانات دي، وهتطلب منك تغيّر كلمة السر في أول دخول." }));
        root.appendChild(h("label", { class: "ac_check" }, [ack, "حفظت اسم المستخدم وكلمة السر"]));
        root.appendChild(h("div", { class: "ac_row", style: "margin-top:12px" }, [next]));
        window.scrollTo({ top: 0, behavior: "smooth" });
    }
})();
