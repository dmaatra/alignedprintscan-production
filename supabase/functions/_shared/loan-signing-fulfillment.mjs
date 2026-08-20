const satisfied = new Set(["satisfied", "completed", "confirmed", "passed", "approved", "waived", "not_applicable"]);
const unresolved = new Set(["unknown", "needs_review", "required", "pending", "blocked", "issue", "unable_to_reach", "reschedule_needed", "correction_required"]);

export const LSA_REQUIREMENT_GROUPS = ["assignment", "signers", "appointment", "printing", "package", "stipulations", "signing", "scanbacks", "return", "completion"];
export const LSA_SOURCES = ["orderer_instructions", "closing_instructions", "shipping_label", "email_message", "title_escrow_instruction", "signing_service_instruction", "admin_verified", "other_authoritative_source"];

const activePackage = (packages = []) => packages.find((item) => item.status === "active");
const required = (items = []) => items.filter((item) => item.applicability === "required" || item.required === true);
const incomplete = (item) => unresolved.has(String(item.status || "unknown")) || !satisfied.has(String(item.status || "unknown"));

export function expectedPrintVolume(packageVersion, printing = {}) {
  const pages = Number(packageVersion?.authoritative_page_count || 0);
  const signingSets = Math.max(0, Number(printing.signing_set_count || 0));
  const borrowerCopies = Math.max(0, Number(printing.borrower_copy_count || 0));
  const additionalCopies = Math.max(0, Number(printing.additional_copy_count || 0));
  const copies = signingSets + borrowerCopies + additionalCopies;
  return { source_pages: pages, copy_count: copies, expected_printed_pages: pages * copies, expected_sheets: printing.sidedness === "double_sided" ? Math.ceil(pages / 2) * copies : pages * copies };
}

export function loanSigningCompletion(input = {}) {
  const blockers = [];
  const add = (code, message, section) => { if (!blockers.some((item) => item.code === code)) blockers.push({ code, message, section }); };
  const assignment = input.assignment || {};
  const requirements = input.requirements || [];
  const packages = input.packages || [];
  const stipulations = input.stipulations || [];
  const scanbacks = input.scanbacks || [];
  const returns = input.returns || [];
  const packageVersion = activePackage(packages);

  required(requirements).filter(incomplete).forEach((item) => add(`REQUIREMENT_${String(item.requirement_key || item.id).toUpperCase()}`, `${item.title || "Assignment requirement"} is unresolved`, item.requirement_group));
  if (!assignment.instructions_reviewed_at) add("INSTRUCTIONS_REVIEW", "Assignment instructions have not been reviewed", "assignment");
  if (!packageVersion) add("ACTIVE_PACKAGE", "An active package version is required", "package");
  if (packageVersion && !packageVersion.authoritative_page_count) add("PAGE_COUNT", "The active package needs an authoritative page count", "package");
  if (assignment.printing_required === true && assignment.print_qc_status !== "passed") add("PRINT_QC", "Required print QC has not passed", "printing");
  if (assignment.borrower_copy_required === "yes" && assignment.borrower_copy_status !== "prepared") add("BORROWER_COPY", "Required signer or borrower copy is not prepared", "printing");
  if (assignment.signer_confirmation_required === true && assignment.signer_confirmation_status !== "confirmed") add("SIGNER_CONFIRMATION", "Required signer confirmation is incomplete", "signers");
  if (!["completed", "partially_completed_review", "did_not_complete_review"].includes(assignment.signing_outcome)) add("SIGNING_OUTCOME", "Signing outcome has not been recorded", "signing");
  required(stipulations).filter((item) => !["satisfied", "collected", "waived_by_authorized_orderer"].includes(item.status)).forEach((item) => add(`STIPULATION_${item.id}`, `${item.title || "Required stipulation"} is unresolved`, "stipulations"));

  if (assignment.scanbacks_required === "yes") {
    const scanback = scanbacks.find((item) => item.package_version_id === packageVersion?.id) || scanbacks[0];
    if (!scanback || !["submitted", "accepted", "approval_pending", "approved_for_return"].includes(scanback.status)) add("SCANBACK_SUBMISSION", "Required scanbacks have not been submitted", "scanbacks");
    if (scanback?.qc_status !== "passed") add("SCANBACK_QC", "Required scanback QC has not passed", "scanbacks");
    if (assignment.approval_before_return_required === "yes" && scanback?.status !== "approved_for_return") add("RETURN_APPROVAL", "Explicit approval for return has not been recorded", "scanbacks");
    if (scanback?.status === "correction_required") add("RESCAN_REQUIRED", "Scanback correction or rescan remains unresolved", "scanbacks");
  }

  if (assignment.physical_return_required === "yes") {
    const currentReturn = returns.find((item) => item.status !== "superseded") || returns[0];
    if (!currentReturn) add("RETURN_RECORD", "Required package return has not been recorded", "return");
    else {
      if (currentReturn.label_required && !currentReturn.label_provided) add("SHIPPING_LABEL", "Required shipping label is missing", "return");
      if (currentReturn.tracking_required && !currentReturn.tracking_number) add("TRACKING", "Required tracking number is missing", "return");
      if (currentReturn.proof_required && !currentReturn.proof_file_id && !currentReturn.proof_recorded_at) add("RETURN_PROOF", "Required return proof is missing", "return");
      if (!currentReturn.completed_at) add("RETURN_COMPLETE", "Package return is not complete", "return");
    }
  }
  if (assignment.physical_return_required === "no" && assignment.return_method && assignment.return_method !== "no_physical_return") add("RETURN_METHOD_CONFLICT", "No-physical-return assignment has a physical return method", "return");
  if (input.payment_terms === "prepaid" && Number(input.prepaid_balance || 0) > 0.009) add("PREPAID_BALANCE", "Outstanding prepaid balance remains", "financial");
  return { allowed: blockers.length === 0, blockers, active_package_version: packageVersion?.version_number || null };
}

export function customerSafeLoanSigningProgress(input = {}) {
  const assignment = input.assignment || {};
  const stages = { assignment_received: "Assignment Received", instructions_review: "Preparing Documents", package_preparation: "Preparing Documents", ready_for_appointment: "Appointment Ready", signing: "Signing", post_signing_requirements: "Post-Signing Review", return: "Returning Package", completed: "Completed" };
  const currentReturn = (input.returns || [])[0] || {};
  return {
    stage: stages[assignment.lsa_stage] || "Assignment Received",
    scanbacks: assignment.scanbacks_required === "no" ? "Not Required" : assignment.approval_before_return_required === "yes" ? (input.scanbacks?.[0]?.status === "approved_for_return" ? "Approved" : "Pending Review") : (input.scanbacks?.[0]?.submitted_at ? "Submitted" : "Required"),
    return: assignment.physical_return_required === "no" ? "Not Required" : assignment.return_method === "direct_title_escrow" ? "Direct Delivery" : currentReturn.completed_at ? "Carrier Drop-off" : "Return Pending",
    carrier: currentReturn.carrier || null,
    tracking_number: currentReturn.tracking_number || null,
    drop_off_at: currentReturn.drop_off_at || null,
    completed_at: assignment.completed_at || null,
  };
}
