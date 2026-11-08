document.addEventListener("DOMContentLoaded", async () => {
  const loadComponents = async () => {
    const elements = document.querySelectorAll("[data-include]");
    const promises = Array.from(elements).map(async (el) => {
      const file = el.getAttribute("data-include");
      try {
        const response = await fetch(file);
        if (response.ok) {
          const content = await response.text();
          el.innerHTML = content;
          el.removeAttribute("data-include");
        }
      } catch (e) {}
    });
    await Promise.all(promises);
  };

  await loadComponents();

  if (typeof AOS !== "undefined") {
    AOS.init({
      duration: 800,
      once: true,
      offset: 60,
      easing: "ease-out-cubic",
    });
  }

  if (typeof gsap !== "undefined") {
    const tl = gsap.timeline();

    tl.from(".hero-badge", { opacity: 0, y: -20, duration: 0.6, ease: "power2.out" })
      .from(".hero-title", { opacity: 0, y: 35, duration: 0.8, ease: "power3.out" }, "-=0.2")
      .from(".hero-desc", { opacity: 0, y: 20, duration: 0.6, ease: "power2.out" }, "-=0.4")
      .from(".hero-actions", { opacity: 0, y: 20, duration: 0.6, ease: "power2.out" }, "-=0.3");

    gsap.to(".glow-1", {
      x: 70,
      y: 45,
      duration: 8,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut",
    });

    gsap.to(".glow-2", {
      x: -60,
      y: -35,
      duration: 10,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut",
    });

    gsap.to(".glow-3", {
      x: 50,
      y: -55,
      duration: 12,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut",
    });
  }

  window.addEventListener("scroll", () => {
    const navbar = document.querySelector(".navbar");
    if (navbar) {
      if (window.scrollY > 40) {
        navbar.style.boxShadow = "0 10px 30px rgba(249, 115, 22, 0.08)";
        navbar.style.background = "rgba(255, 255, 255, 0.98)";
      } else {
        navbar.style.boxShadow = "0 4px 20px rgba(0, 0, 0, 0.03)";
        navbar.style.background = "rgba(255, 255, 255, 0.94)";
      }
    }
  });
});