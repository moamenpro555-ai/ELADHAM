(function () {
    "use strict";
    var E = window.Eladham;
    var form = document.getElementById("ac_login");
    var err = document.getElementById("ac_err");
    var go = document.getElementById("ac_go");

    // الصفحة اللي نرجع ليها بعد الدخول: اسم ملف html في نفس الموقع بس (مفيش روابط خارجية)
    function nextPage(u) {
        var n = new URLSearchParams(location.search).get("next") || "";
        if (u.role === "student" && /^[A-Za-z0-9_-]+\.html(\?[A-Za-z0-9_=&%.-]*)?$/.test(n)) return n;
        return u.role === "teacher" ? "teacher.html" : "dashboard.html";
    }
    // لو أنت داخل بالفعل، ودّيني على لوحتي
    E.loadSession().then(function (u) { location.replace(nextPage(u)); }).catch(function () {});

    form.addEventListener("submit", async function (ev) {
        ev.preventDefault();
        err.textContent = "";
        var email = document.getElementById("ac_email").value.trim();
        var pass = document.getElementById("ac_pass").value;
        if (!email || !pass) { err.textContent = "اكتب رقم تليفونك (أو الإيميل) وكلمة السر."; return; }
        go.disabled = true;
        try {
            var u = await E.login(email, pass);
            location.replace(nextPage(u));
        } catch (e) {
            err.textContent = e.message || "حصل خطأ، جرّب تاني.";
            go.disabled = false;
        }
    });
})();
