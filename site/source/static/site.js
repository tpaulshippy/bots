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

    /* ---- tutorial reading progress and active step ---- */
    var progress = document.querySelector(".progress > span");
    var progressBar = document.querySelector(".progress[role='progressbar']");
    var tutorialSteps = Array.prototype.slice.call(document.querySelectorAll("[data-tutorial-step]"));
    var stepLinks = Array.prototype.slice.call(document.querySelectorAll("[data-step-link]"));
    var stepStatus = document.querySelector("[data-step-current]");

    if (progress && tutorialSteps.length) {
        var activeStep = -1;
        var updateProgress = function () {
            var scrollable = document.documentElement.scrollHeight - window.innerHeight;
            var ratio = scrollable > 0 ? window.scrollY / scrollable : 0;
            var percentage = Math.min(100, Math.max(0, ratio * 100));
            progress.style.width = percentage.toFixed(2) + "%";
            if (progressBar) progressBar.setAttribute("aria-valuenow", Math.round(percentage).toString());

            var activeIndex = 0;
            var marker = window.innerHeight * 0.34;
            tutorialSteps.forEach(function (step, index) {
                if (step.getBoundingClientRect().top <= marker) activeIndex = index;
            });
            if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) {
                activeIndex = tutorialSteps.length - 1;
            }

            if (activeIndex !== activeStep) {
                activeStep = activeIndex;
                var current = tutorialSteps[activeIndex];
                if (stepStatus) {
                    stepStatus.textContent = "Step " + (activeIndex + 1) + " of " + tutorialSteps.length + " · " + current.getAttribute("data-step-label");
                }
                stepLinks.forEach(function (link, index) {
                    if (index === activeIndex) link.setAttribute("aria-current", "step");
                    else link.removeAttribute("aria-current");
                });
            }
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
