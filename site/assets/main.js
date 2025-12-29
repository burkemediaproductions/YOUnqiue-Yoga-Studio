// YOUnique Yoga — basic UI behaviors (mobile drawer + active link)
(function () {
  const burger = document.querySelector("[data-burger]");
  const drawer = document.querySelector("[data-drawer]");
  if (burger && drawer) {
    burger.addEventListener("click", () => {
      const open = drawer.getAttribute("data-open") === "true";
      drawer.setAttribute("data-open", String(!open));
      drawer.style.display = open ? "none" : "block";
      burger.setAttribute("aria-expanded", String(!open));
    });
  }

  // Active nav (simple path match)
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  document.querySelectorAll(".nav a, .mobile-drawer a").forEach((a) => {
    const href = (a.getAttribute("href") || "").replace(/\/+$/, "") || "/";
    if (href === path) a.classList.add("active");
  });
})();
