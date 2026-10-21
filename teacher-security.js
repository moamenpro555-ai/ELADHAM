// ================== teacher-security.js : التحقق بخطوتين لحساب المدرس ==================
(function () {
    "use strict";
    var ui = window.TeacherUI, E = window.Eladham, h = E.h;
    if (!ui) return;

    ui.securityPanel = async function (el) {
        E.clear(el);
        var me;
        try { me = (await E.call("GET", "/api/auth/me")).user; } catch (e) { el.appendChild(h("p", { class: "ac_msg", text: e.message })); return; }
        var msg = h("p", { class: "ac_msg", role: "alert" });
        var box = h("div", { class: "ac_card", style: "margin-top:12px" });
        el.appendChild(box);

        function pwField() { return h("input", { type: "password", id: "tfa_pw", autocomplete: "current-password", placeholder: "كلمة السر" }); }
        function codeField() { return h("input", { type: "text", id: "tfa_code", inputmode: "numeric", dir: "ltr", maxlength: "10", autocomplete: "one-time-code", placeholder: "123456" }); }
        async function act(fn) { msg.textContent = ""; try { await fn(); } catch (e) { msg.textContent = e.message || "حصل خطأ"; } }

        function off() {
            E.clear(box);
            var pw = pwField();
            box.appendChild(h("h3", { class: "ac_h2", text: "التحقق بخطوتين: مقفول" }));
            box.appendChild(h("p", { class: "ac_sub", text: "فعّله عشان حد يعرف كلمة السر بتاعتك ميقدرش يدخل لوحة المدرس. محتاج تطبيق Google Authenticator أو Microsoft Authenticator على موبايلك." }));
            box.appendChild(pw);
            box.appendChild(h("button", { type: "button", class: "ac_btn b_dark", id: "tfa_start", text: "ابدأ التفعيل", onclick: function () {
                act(async function () {
                    var d = await E.call("POST", "/api/auth/2fa/setup", { password: pw.value });
                    confirmStep(d);
                });
            } }));
            box.appendChild(msg);
        }
        function confirmStep(d) {
            E.clear(box);
            var code = codeField();
            box.appendChild(h("p", { class: "ac_sub", text: "في التطبيق اختار «إضافة حساب» ثم «إدخال مفتاح الإعداد» واكتب المفتاح ده (النوع: مبني على الوقت):" }));
            box.appendChild(h("div", { class: "ac_num", id: "tfa_secret", dir: "ltr", style: "user-select:all;font-weight:800;letter-spacing:1px", text: d.secret }));
            box.appendChild(h("p", { class: "ac_sub", text: "بعدين اكتب الكود المكوّن من 6 أرقام اللي ظهر في التطبيق:" }));
            box.appendChild(code);
            box.appendChild(h("button", { type: "button", class: "ac_btn b_dark", id: "tfa_enable", text: "تأكيد وتفعيل", onclick: function () {
                act(async function () {
                    var r = await E.call("POST", "/api/auth/2fa/enable", { code: code.value });
                    recovery(r.recoveryCodes);
                });
            } }));
            box.appendChild(msg);
        }
        function recovery(list) {
            E.clear(box);
            box.appendChild(h("h3", { class: "ac_h2", text: "اتفعّل ✔" }));
            box.appendChild(h("p", { class: "ac_sub", text: "احفظ أكواد الطوارئ دي في مكان آمن (ورقة أو مدير كلمات سر). كل كود بيشتغل مرة واحدة لو ضاع موبايلك. مش هتظهر تاني:" }));
            box.appendChild(h("pre", { id: "tfa_recovery", dir: "ltr", style: "user-select:all;white-space:pre-wrap", text: list.join("\n") }));
        }
        function on() {
            E.clear(box);
            var pw = pwField(), code = codeField();
            box.appendChild(h("h3", { class: "ac_h2", text: "التحقق بخطوتين: شغّال ✔" }));
            box.appendChild(h("p", { class: "ac_sub", text: "لو عايز تقفله اكتب كلمة السر وكود من التطبيق:" }));
            box.appendChild(pw); box.appendChild(code);
            box.appendChild(h("button", { type: "button", class: "ac_btn b_line", id: "tfa_disable", text: "إيقاف", onclick: function () {
                act(async function () { await E.call("POST", "/api/auth/2fa/disable", { password: pw.value, code: code.value }); off(); });
            } }));
            box.appendChild(msg);
        }
        if (me.twoFactor) on(); else off();
    };
})();
