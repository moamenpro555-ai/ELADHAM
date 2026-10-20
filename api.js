// ================== api.js : الاتصال بالسيرفر + أدوات مشتركة لصفحات الحساب ==================
(function () {
    "use strict";
    var BASE = String(window.ELADHAM_API || "").replace(/\/$/, "");
    var csrf = null;

    var STAGES = { primary: "ابتدائي", prep: "إعدادي", secondary: "ثانوي" };
    var GRADES = ["", "الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس"];
    var MONTHS = ["", "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
    var SECTIONS = { courses: "كورسات", sessions: "حصص", homework: "واجب" };
    var KINDS = { session: "امتحان حصة", month: "امتحان شهر", homework: "واجب" };
    var LETTERS = ["أ", "ب", "ج", "د", "هـ"];

    async function call(method, path, body) {
        var opts = { method: method, credentials: "include", headers: {} };
        if (body !== undefined) {
            opts.headers["Content-Type"] = "application/json";
            opts.body = JSON.stringify(body);
        }
        if (method !== "GET" && csrf) opts.headers["X-CSRF-Token"] = csrf;
        var res;
        try {
            res = await fetch(BASE + path, opts);
        } catch (e) {
            throw { code: "NETWORK", status: 0, message: "مش قادر أوصل للسيرفر. اتأكد من النت وجرّب تاني." };
        }
        var json = null;
        try { json = await res.json(); } catch (e) { /* not json */ }
        if (!res.ok || !json || json.ok === false) {
            var err = (json && json.error) || { code: "HTTP_" + res.status, message: "حصل خطأ، جرّب تاني." };
            err.status = res.status;
            throw err;
        }
        return json.data;
    }

    // ---------- أدوات DOM (كل النصوص بتتحط بـ textContent، عمرها ما بتتفسر كـ HTML) ----------
    function h(tag, attrs, kids) {
        var n = document.createElement(tag);
        if (attrs) {
            Object.keys(attrs).forEach(function (k) {
                var v = attrs[k];
                if (v === false || v === null || v === undefined) return;
                if (k === "class") n.className = v;
                else if (k === "text") n.textContent = v;
                else if (k.slice(0, 2) === "on" && typeof v === "function") n.addEventListener(k.slice(2), v);
                else n.setAttribute(k, v === true ? "" : v);
            });
        }
        [].concat(kids === undefined ? [] : kids).forEach(function (c) {
            if (c === null || c === undefined || c === false) return;
            n.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
        });
        return n;
    }
    function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }
    function num(n) { return Number(n).toLocaleString("ar-EG"); }
    function courseLabel(c) { return (STAGES[c.stage] || c.stage) + " - الصف " + (GRADES[c.grade] || c.grade); }
    function placeLabel(stage, grade) { return stage && grade ? courseLabel({ stage: stage, grade: grade }) : "غير محدد"; }
    function examWhen(e) { if (e.kind === "homework") return "واجب"; return e.kind === "month" ? "امتحان شهر " + (MONTHS[e.month] || "") : "امتحان حصة" + (e.sessionNo ? " رقم " + Number(e.sessionNo).toLocaleString("ar-EG") : ""); }

    // رفع ملف خام (صورة / PDF). السيرفر بيتعرّف على نوعه من محتواه مش من اسمه.
    async function upload(method, path, file) {
        var headers = { "Content-Type": "application/octet-stream" };
        if (csrf) headers["X-CSRF-Token"] = csrf;
        var res;
        try { res = await fetch(BASE + path, { method: method, credentials: "include", headers: headers, body: file }); }
        catch (e) { throw { code: "NETWORK", status: 0, message: "مش قادر أوصل للسيرفر. اتأكد من النت وجرّب تاني." }; }
        var json = null; try { json = await res.json(); } catch (e) { /* */ }
        if (!res.ok || !json || json.ok === false) {
            var err = (json && json.error) || { code: "HTTP_" + res.status, message: "فشل رفع الملف" };
            err.status = res.status; throw err;
        }
        return json.data;
    }
    // بيجيب ملف محمي (بالكوكي) ويرجّعه كرابط مؤقت يتحط في img أو iframe
    async function blobUrl(path) {
        var res = await fetch(BASE + path, { credentials: "include" });
        if (!res.ok) throw { status: res.status, message: "مقدرتش أحمّل الملف" };
        return URL.createObjectURL(await res.blob());
    }

    // رسالة صغيرة بتظهر فوق وتختفي لوحدها
    function toast(msg, kind) {
        var box = document.getElementById("ac_toasts");
        if (!box) { box = h("div", { id: "ac_toasts", "aria-live": "polite" }); document.body.appendChild(box); }
        var t = h("div", { class: "ac_toast " + (kind === "bad" ? "t_bad" : "t_ok"), text: msg });
        box.appendChild(t);
        setTimeout(function () { t.remove(); }, 4200);
    }

    // تأكيد قبل الحاجات الخطيرة (حذف مثلًا)
    function confirmBox(message, yesText) {
        return new Promise(function (resolve) {
            var dlg = h("dialog", { class: "ac_dlg" }, [
                h("p", { text: message }),
                h("div", { class: "ac_row" }, [
                    h("button", { type: "button", class: "ac_btn b_bad", text: yesText || "تأكيد", onclick: function () { done(true); } }),
                    h("button", { type: "button", class: "ac_btn b_line", text: "إلغاء", onclick: function () { done(false); } })
                ])
            ]);
            function done(v) { dlg.close(); dlg.remove(); resolve(v); }
            dlg.addEventListener("cancel", function () { done(false); });
            document.body.appendChild(dlg);
            dlg.showModal();
        });
    }

    async function loadSession() {
        var d = await call("GET", "/api/auth/me");
        csrf = d.csrfToken;
        return d.user;
    }

    window.Eladham = {
        STAGES: STAGES, GRADES: GRADES, SECTIONS: SECTIONS, MONTHS: MONTHS, KINDS: KINDS, LETTERS: LETTERS,
        placeLabel: placeLabel, examWhen: examWhen, upload: upload, blobUrl: blobUrl,
        call: call, h: h, clear: clear, num: num, courseLabel: courseLabel, toast: toast, confirmBox: confirmBox,
        setCsrf: function (t) { csrf = t; },
        loadSession: loadSession,
        // يرجّع المستخدم لو داخل، وإلا يودّيه لصفحة الدخول
        requireUser: async function (role) {
            try {
                var u = await loadSession();
                if (role && u.role !== role) { location.replace(u.role === "teacher" ? "teacher.html" : "dashboard.html"); return null; }
                return u;
            } catch (e) {
                if (e.status === 401) {
                    // بنفتكر الصفحة اللي كان رايحلها (مثلاً كورس معين) ونرجّعه ليها بعد الدخول
                    var here = location.pathname.split("/").pop() + location.search;
                    location.replace("login.html?next=" + encodeURIComponent(here));
                    return null;
                }
                throw e;
            }
        },
        login: async function (identifier, password) {
            var d = await call("POST", "/api/auth/login", { identifier: identifier, password: password });
            csrf = d.csrfToken;
            return d.user;
        },
        logout: async function () {
            try { await call("POST", "/api/auth/logout", {}); } catch (e) { /* even if it fails, leave */ }
            location.replace("login.html");
        },
        // نموذج تغيير كلمة السر (بيتستخدم في لوحة الطالب والمدرس)
        passwordForm: function (opts) {
            var cur = h("input", { type: "password", id: "ac_pw_cur", autocomplete: "current-password", required: true });
            var nw = h("input", { type: "password", id: "ac_pw_new", autocomplete: "new-password", required: true, minlength: "8" });
            var msg = h("p", { class: "ac_msg", role: "alert" });
            var btn = h("button", { type: "submit", class: "ac_btn b_dark", text: "حفظ كلمة السر الجديدة" });
            var form = h("form", { class: "ac_form", novalidate: true }, [
                h("label", { for: "ac_pw_cur", text: "كلمة السر الحالية" }), cur,
                h("label", { for: "ac_pw_new", text: "كلمة السر الجديدة (8 حروف على الأقل)" }), nw,
                msg, btn
            ]);
            form.addEventListener("submit", async function (ev) {
                ev.preventDefault();
                msg.textContent = ""; btn.disabled = true;
                try {
                    await call("POST", "/api/auth/change-password", { currentPassword: cur.value, newPassword: nw.value });
                    cur.value = ""; nw.value = "";
                    toast("اتغيّرت كلمة السر");
                    if (opts && opts.onDone) opts.onDone();
                } catch (e) {
                    msg.textContent = e.message || "حصل خطأ";
                } finally { btn.disabled = false; }
            });
            return form;
        }
    };
})();
