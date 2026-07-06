// ============================================================================
// g1_creative_gate / lp — app.js
// Vanilla ES6, no frameworks, no build step. Loaded with <script defer>.
// ============================================================================

// ---- i18n dictionary --------------------------------------------------
const i18n = {
  ja: {
    ctaLabel: "事前登録して先行プレイ",
    emailLabel: "メールアドレス",
    emailPlaceholder: "you@example.com",
    submitLabel: "登録する",
    thankYou: "ご登録ありがとうございます！先行プレイの詳細は追ってメールでご連絡します。",
    formError: "送信に失敗しました。時間をおいて再度お試しください。",
  },
  en: {
    ctaLabel: "Pre-register for Early Access",
    emailLabel: "Email address",
    emailPlaceholder: "you@example.com",
    submitLabel: "Sign up",
    thankYou: "Thanks for registering! We'll email you the early access details soon.",
    formError: "Submission failed. Please try again later.",
  },
};

// Config-fetch-failure fallback: hardcoded bilingual message already lives in
// the HTML (#config-error). We just need to reveal it when fetch fails, and
// otherwise leave it hidden.

// Module-level state populated once config.json is fetched.
let formActionUrl = "";
let formFieldMap = null; // e.g. { email: "entry.123" } — remaps names for Google Forms formResponse
let currentStrings = i18n.ja;

document.addEventListener("DOMContentLoaded", () => {
  const heroImage = document.getElementById("hero-image");
  const titleEl = document.getElementById("title");
  const taglineEl = document.getElementById("tagline");
  const ctaButton = document.getElementById("cta-button");
  const signupForm = document.getElementById("signup-form");
  const emailInput = document.getElementById("email-input");
  const emailLabel = signupForm ? signupForm.querySelector('label[for="email-input"]') : null;
  const submitButton = signupForm ? signupForm.querySelector('button[type="submit"]') : null;
  const thankYouEl = document.getElementById("thank-you");
  const configErrorEl = document.getElementById("config-error");

  // ---- UTM passthrough --------------------------------------------------
  // Read utm_source / utm_campaign / variant from the current URL's query
  // string and copy them into the form's hidden inputs so they ride along
  // with the submission (via FormData) for attribution purposes.
  const params = new URLSearchParams(window.location.search);
  const utmSourceInput = signupForm ? signupForm.querySelector('input[name="utm_source"]') : null;
  const utmCampaignInput = signupForm ? signupForm.querySelector('input[name="utm_campaign"]') : null;
  const variantInput = signupForm ? signupForm.querySelector('input[name="variant"]') : null;

  if (utmSourceInput) utmSourceInput.value = params.get("utm_source") ?? "";
  if (utmCampaignInput) utmCampaignInput.value = params.get("utm_campaign") ?? "";
  if (variantInput) variantInput.value = params.get("variant") ?? "";

  // ---- Config fetch + render ---------------------------------------------
  fetch("./config.json")
    .then((response) => {
      if (!response.ok) {
        throw new Error(`config.json HTTP error: ${response.status}`);
      }
      return response.json();
    })
    .then((config) => {
      // Loose validation: guard against totally malformed data without being
      // overly strict about every field.
      if (!config || typeof config !== "object") {
        throw new Error("config.json did not parse to an object");
      }

      if (titleEl && typeof config.title === "string") {
        titleEl.textContent = config.title;
      }
      if (taglineEl && typeof config.tagline === "string") {
        taglineEl.textContent = config.tagline;
      }
      if (heroImage && typeof config.heroImage === "string") {
        heroImage.src = config.heroImage;
      }

      // Variant-specific hero: when the ad's ?variant= matches a known cell,
      // show that cell's gameplay still so the LP matches the ad the visitor
      // clicked (message match). Unknown/missing variant keeps config default.
      const KNOWN_VARIANTS = ["control", "a", "b", "c"];
      const variant = params.get("variant");
      if (heroImage && KNOWN_VARIANTS.includes(variant)) {
        heroImage.src = `assets/hero-${variant}.jpg`;
      }

      const locale = config.locale === "en" ? "en" : "ja"; // fallback to ja
      currentStrings = i18n[locale];

      if (ctaButton) ctaButton.textContent = currentStrings.ctaLabel;
      if (emailLabel) emailLabel.textContent = currentStrings.emailLabel;
      if (emailInput) emailInput.placeholder = currentStrings.emailPlaceholder;
      if (submitButton) submitButton.textContent = currentStrings.submitLabel;

      // Store formAction both on the form element (for HTML fallback /
      // debugging) and in the module-level variable used by the submit
      // handler.
      if (typeof config.formAction === "string") {
        formActionUrl = config.formAction;
        if (signupForm) signupForm.setAttribute("action", config.formAction);
      }
      if (config.formFields && typeof config.formFields === "object") {
        formFieldMap = config.formFields;
      }
    })
    .catch((err) => {
      // Config fetch failed (network error, non-OK response, or bad JSON).
      // Reveal the hardcoded bilingual fallback message and leave the rest
      // of the page's default/skeleton content visible rather than blanking
      // the page.
      console.error("Failed to load config.json:", err);
      if (configErrorEl) configErrorEl.style.display = "block";
    });

  // ---- CTA click: smooth-scroll to the form -----------------------------
  if (ctaButton) {
    ctaButton.addEventListener("click", () => {
      const form = document.querySelector("#signup-form");
      if (form) form.scrollIntoView({ behavior: "smooth" });
    });
  }

  // ---- Form submit handler -----------------------------------------------
  if (signupForm) {
    signupForm.addEventListener("submit", (event) => {
      event.preventDefault();

      if (!formActionUrl) {
        // Case A: no real submission target configured at all.
        showFormError();
        return;
      }

      if (formActionUrl.includes("REPLACE_ME")) {
        // Case B: intentional dev/preview behavior. The placeholder
        // Formspree URL hasn't been swapped for a real endpoint yet, so we
        // deliberately skip the network call entirely and just show the
        // thank-you state, so the page "works" for local preview/demo
        // purposes before a real endpoint is wired up.
        showThankYou();
        return;
      }

      // Case C: looks like a real endpoint. FormData naturally picks up the
      // email field plus the 3 hidden UTM fields since they're all inside
      // the <form>.
      let formData = new FormData(signupForm);

      // Google Forms (and similar backends) expect entry.NNN field names.
      // When config.formFields provides a mapping, rebuild the payload with
      // the mapped names; unmapped fields are dropped intentionally.
      if (formFieldMap) {
        const mapped = new FormData();
        for (const [name, targetName] of Object.entries(formFieldMap)) {
          const value = formData.get(name);
          if (value !== null && value !== "") mapped.append(targetName, value);
        }
        formData = mapped;
      }

      // Fire-and-forget: under mode: 'no-cors' the response is opaque, so we
      // cannot distinguish success from failure client-side. This is a
      // deliberate no-backend fake-door tradeoff to keep the page fully
      // static. We optimistically show the thank-you state immediately
      // rather than waiting on the network round-trip (which could hang).
      fetch(formActionUrl, {
        method: "POST",
        mode: "no-cors",
        body: formData,
      }).catch(() => {
        // Swallow errors — see no-cors comment above, we can't act on them
        // anyway and the UI has already moved on optimistically.
      });

      showThankYou();
    });
  }

  function showThankYou() {
    if (signupForm) signupForm.style.display = "none";
    if (thankYouEl) {
      thankYouEl.textContent = currentStrings.thankYou;
      thankYouEl.style.display = "block";
    }
  }

  function showFormError() {
    // No real submission target is configured (Case A). Surface the
    // locale-appropriate generic form-error message using the thank-you
    // slot, but keep the form visible/usable so the user could retry later
    // once a real endpoint is configured.
    if (thankYouEl) {
      thankYouEl.textContent = currentStrings.formError;
      thankYouEl.style.display = "block";
    }
  }
});
