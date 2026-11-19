/* Syft Learning site behaviour: scroll reveals, animated meters, the reading
   progress bar on the tutorial, and the mobile nav toggle.

   No dependencies and no build step. Everything degrades gracefully: without
   JS the page renders fully (the .reveal elements are visible by default and
   the script only ever adds to the page). */
(function () {
    var root = document.documentElement;
    root.classList.add("js");

    var reduceMotion =
        window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* ---- scroll reveal ---- */
    var revealables = Array.prototype.slice.call(document.querySelectorAll(".reveal"));

    if (!("IntersectionObserver" in window) || reduceMotion) {
        revealables.forEach(function (el) {
            el.classList.add("in");
        });
    } else {
        var revealer = new IntersectionObserver(
            function (entries) {
                entries.forEach(function (entry) {
                    if (!entry.isIntersecting) return;
                    entry.target.classList.add("in");
                    revealer.unobserve(entry.target);
                });
            },
            { rootMargin: "0px 0px -12% 0px", threshold: 0.06 }
        );
        revealables.forEach(function (el) {
            revealer.observe(el);
        });
    }

    /* ---- meters fill when they scroll into view ---- */
    var meters = Array.prototype.slice.call(document.querySelectorAll(".meter"));

    if (!("IntersectionObserver" in window) || reduceMotion) {
        meters.forEach(function (el) {
            el.classList.add("is-in");
        });
    } else {
        var meterWatch = new IntersectionObserver(
            function (entries) {
                entries.forEach(function (entry) {
                    if (!entry.isIntersecting) return;
                    entry.target.classList.add("is-in");
                    meterWatch.unobserve(entry.target);
                });
            },
            { threshold: 0.4 }
        );
        meters.forEach(function (el) {
            meterWatch.observe(el);
        });
    }

    /* ---- tutorial reading progress ---- */
    var progress = document.querySelector(".progress > span");
    if (progress) {
        var updateProgress = function () {
            var scrollable = document.documentElement.scrollHeight - window.innerHeight;
            var ratio = scrollable > 0 ? window.scrollY / scrollable : 0;
            progress.style.width = Math.min(100, Math.max(0, ratio * 100)).toFixed(2) + "%";
        };
        updateProgress();
        window.addEventListener("scroll", updateProgress, { passive: true });
        window.addEventListener("resize", updateProgress);
    }

    /* ---- mobile nav ---- */
    var toggle = document.querySelector("[data-nav-toggle]");
    var menu = document.querySelector("[data-nav-menu]");
    if (toggle && menu) {
        var setMenuOpen = function (open) {
            menu.classList.toggle("is-open", open);
            toggle.setAttribute("aria-expanded", open ? "true" : "false");
            toggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
        };

        toggle.addEventListener("click", function () {
            setMenuOpen(toggle.getAttribute("aria-expanded") !== "true");
        });

        menu.addEventListener("click", function (event) {
            if (event.target.closest("a")) setMenuOpen(false);
        });

        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
                setMenuOpen(false);
                toggle.focus();
            }
        });
    }
})();
