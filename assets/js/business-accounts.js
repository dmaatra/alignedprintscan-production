(() => {
  "use strict";

  const form = document.querySelector("#businessAccountForm");
  const status = document.querySelector("#businessAccountStatus");
  if (!form || !window.supabase) return;

  const client = window.supabase.createClient(
    "https://sfsdniavqldgbiretply.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmc2RuaWF2cWxkZ2JpcmV0cGx5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MTY5MTEsImV4cCI6MjA5MDk5MjkxMX0.3tcbpUVDq9J80f5CdngDxdJ1T70vlouCrfGuv55JCco",
  );
  const steps = [...form.querySelectorAll("[data-business-step]")];
  const stepNames = [
    "Business Information",
    "Primary Contact",
    "Services & Business Needs",
    "Billing & Account Preferences",
    "Review & Submit",
  ];
  const back = document.querySelector("#businessBack");
  const next = document.querySelector("#businessContinue");
  const submit = document.querySelector("#businessSubmit");
  const error = document.querySelector("#businessApplicationError");
  let currentStep = 0;
  let submitting = false;

  const friendly = (value) => String(value || "Not provided")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  const escapeHtml = (value) => String(value ?? "").replace(
    /[&<>"']/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character],
  );
  const value = (name) => String(form.elements[name]?.value || "").trim();
  const selectedServices = () => [...form.querySelectorAll('[name="services_interested"]:checked')].map((input) => input.value);

  function validateStep(index, announce = true) {
    error.textContent = "";
    const controls = [...steps[index].querySelectorAll("input, select, textarea")];
    const invalid = controls.find((control) => !control.checkValidity());
    if (invalid) {
      if (announce) {
        error.textContent = invalid.validationMessage || "Please complete the highlighted field.";
        invalid.reportValidity();
        invalid.focus();
      }
      return false;
    }
    if (index === 2 && selectedServices().length === 0) {
      if (announce) {
        error.textContent = "Choose at least one service your business is interested in.";
        form.querySelector('[name="services_interested"]')?.focus();
      }
      return false;
    }
    return true;
  }

  function reviewSection(title, step, rows) {
    return `<section><header><h4>${escapeHtml(title)}</h4><button type="button" data-edit-step="${step}">Edit</button></header><dl>${rows.map(([label, content]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(content || "Not provided")}</dd></div>`).join("")}</dl></section>`;
  }

  function renderReview() {
    const services = selectedServices().map(friendly).join(", ");
    document.querySelector("#businessApplicationReview").innerHTML = [
      reviewSection("Business Information", 0, [
        ["Business name", value("organization_name")],
        ["Business type", friendly(value("business_type"))],
        ["Website", value("website")],
        ["Address", [value("address_line1"), value("address_line2"), value("city"), value("state"), value("zip")].filter(Boolean).join(", ")],
      ]),
      reviewSection("Primary Contact", 1, [
        ["Name", value("primary_contact_name")],
        ["Business email", value("business_email")],
        ["Phone", value("phone")],
      ]),
      reviewSection("Services & Business Needs", 2, [
        ["Services", services],
        ["Estimated monthly volume", value("estimated_monthly_volume")],
        ["Additional information", value("notes")],
      ]),
      reviewSection("Billing & Account Preferences", 3, [
        ["Billing contact", value("billing_contact_name")],
        ["Billing email", value("billing_contact_email")],
        ["Requested payment terms", friendly(value("requested_payment_terms"))],
      ]),
    ].join("");
    form.querySelectorAll("[data-edit-step]").forEach((button) => {
      button.addEventListener("click", () => showStep(Number(button.dataset.editStep)));
    });
  }

  function showStep(index) {
    currentStep = Math.max(0, Math.min(steps.length - 1, index));
    steps.forEach((step, stepIndex) => {
      const active = stepIndex === currentStep;
      step.hidden = !active;
      step.classList.toggle("is-active", active);
    });
    document.querySelector("#businessStepLabel").textContent = `Step ${currentStep + 1} of 5`;
    document.querySelector("#businessStepName").textContent = stepNames[currentStep];
    document.querySelector("#businessProgressBar").style.width = `${((currentStep + 1) / 5) * 100}%`;
    form.querySelector("[role='progressbar']").setAttribute("aria-valuenow", String(currentStep + 1));
    back.hidden = currentStep === 0;
    next.hidden = currentStep === steps.length - 1;
    submit.hidden = currentStep !== steps.length - 1;
    error.textContent = "";
    if (currentStep === steps.length - 1) renderReview();
    steps[currentStep].querySelector("h3")?.focus?.({ preventScroll: true });
  }

  next.addEventListener("click", () => {
    if (validateStep(currentStep)) showStep(currentStep + 1);
  });
  back.addEventListener("click", () => showStep(currentStep - 1));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting || !validateStep(currentStep)) return;
    submitting = true;
    submit.disabled = true;
    status.textContent = "Submitting your application…";
    try {
      const data = Object.fromEntries(new FormData(form).entries());
      delete data.application_confirmation;
      data.services_interested = selectedServices();
      const { data: result, error: submissionError } = await client.functions.invoke(
        "business-account-application",
        { body: data },
      );
      if (submissionError || !result?.ok) {
        throw new Error("We could not submit your application. Please review your information and try again.");
      }
      form.reset();
      form.hidden = true;
      status.textContent = "Application received. Our team will review it and may contact you for additional information. Approval and Business Portal access are not automatic; approved users receive a secure invitation.";
    } catch (submissionError) {
      status.textContent = submissionError.message || "We could not submit your application. Please try again.";
      submit.disabled = false;
      submitting = false;
    }
  });

  showStep(0);
})();
