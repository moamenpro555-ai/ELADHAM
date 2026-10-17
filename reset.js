(function () {
    "use strict";
    var E = window.Eladham;
    var form = document.getElementById("ac_reset");
    var err = document.getElementById("ac_err");
    var go = document.getElementById("ac_go");
    // الرابط شكله reset.html#token=...  (الـ # مش بيتبعت لأي سيرفر ولا بيتسجل)
    var m = /[#&]token=([^&]+)/.exec(location.hash);
    var token = m ? decodeURIComponent(m[1]) : "";
    if (token) history.replaceState(null, "", location.pathname);

    form.addEventListener("submit", async function (ev) {
        ev.preventDefault();
        err.textContent = "";
        var a = document.getElementById("ac_np").value;
        var b = document.getElementById("ac_np2").value;
        if (!token) { err.textContent = "الرابط ناقص أو قديم. اطلب رابط جديد من المدرس."; return; }
        if (a.length < 8) { err.textContent = "كلمة السر لازم تكون 8 حروف على الأقل."; return; }
        if (a !== b) { err.textContent = "كلمتين السر مش متطابقتين."; return; }
        go.disabled = true;
        try {
            await E.call("POST", "/api/auth/password-reset/confirm", { token: token, newPassword: a });
            E.toast("اتغيّرت كلمة السر. ادخل بيها دلوقتي.");
            setTimeout(function () { location.replace("login.html"); }, 1500);
        } catch (e) {
            err.textContent = e.message || "حصل خطأ، جرّب تاني.";
            go.disabled = false;
        }
    });
})();
