(function () {
    "use strict";
    var E = window.Eladham;
    var form = document.getElementById("ac_login");
    var err = document.getElementById("ac_err");
    var go = document.getElementById("ac_go");

    // لو أنت داخل بالفعل، ودّيني على لوحتي
    E.loadSession().then(function (u) { location.replace(u.role === "teacher" ? "teacher.html" : "dashboard.html"); }).catch(function () {});

    form.addEventListener("submit", async function (ev) {
        ev.preventDefault();
        err.textContent = "";
        var email = document.getElementById("ac_email").value.trim();
        var pass = document.getElementById("ac_pass").value;
        if (!email || !pass) { err.textContent = "اكتب الإيميل وكلمة السر."; return; }
        go.disabled = true;
        try {
            var u = await E.login(email, pass);
            location.replace(u.role === "teacher" ? "teacher.html" : "dashboard.html");
        } catch (e) {
            err.textContent = e.message || "حصل خطأ، جرّب تاني.";
            go.disabled = false;
        }
    });
})();
