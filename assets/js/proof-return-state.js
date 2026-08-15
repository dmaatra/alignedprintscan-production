(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.APSProofReturnState = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const text = value => String(value || "").toLowerCase();
  const activeCompletedFiles = files => (files || []).filter(file =>
    file.is_active !== false && text(file.document_classification) === "completed_notarized_document"
  );

  function derive({ request = {}, transaction = null, assets = [], files = [] } = {}) {
    if (!transaction) return state("before_handoff", "Continue in Proof", "Open Proof in a new tab. APS will remain on this request.", "Open Proof", "proof");
    const completedFiles = activeCompletedFiles(files);
    const releasedFile = completedFiles.find(file => file.customer_visible === true && file.eligible_for_delivery === true);
    const reviewedFile = completedFiles.find(file => ["approved", "reviewed", "ready"].includes(text(file.review_state)));
    const pendingFile = completedFiles.find(file => !["approved", "reviewed", "ready"].includes(text(file.review_state)));
    const completedAssets = (assets || []).filter(asset => text(asset.asset_type) === "completed_document");
    const retrievalFailure = completedAssets.find(asset => ["failed", "manual_review", "ambiguous"].includes(text(asset.retrieval_state)));
    const retrievedAsset = completedAssets.find(asset => text(asset.retrieval_state) === "retrieved");
    const retrievingAsset = completedAssets.find(asset => ["claimed", "retrieving", "in_progress"].includes(text(asset.retrieval_state)));
    const proofCompleted = Boolean(transaction.completed_at || text(transaction.meeting_state) === "completed" || ["completed", "released"].includes(text(transaction.proof_status)));
    const apsCompleted = text(request.workflow_status || request.status) === "completed";

    if (apsCompleted) return state("completed", "APS Request Completed", "No further operator action is required.", "No action required", null, releasedFile?.id);
    if (releasedFile) return state("released", "Document Released", "The completed notarized document is available in the customer portal.", "Complete Request", "fulfillment", releasedFile.id);
    if (reviewedFile) return state("ready_release", "Ready for Customer Release", "APS review is complete. Release remains an explicit administrator action.", "Release to Customer", "documents", reviewedFile.id);
    if (pendingFile) return state("ready_review", "Completed Document Ready for Review", "APS securely received the completed notarized document. It remains private pending review.", "Review Completed Document", "documents", pendingFile.id);
    if (retrievalFailure) return state("retrieval_attention", "Completed Document Retrieval Needs Attention", "The completed document is not ready for review. Use the existing safe retrieval recovery control.", "Review Retrieval", "fulfillment", null, true);
    if (retrievedAsset) return state("retrieved", "Completed Document Retrieved", "APS securely retrieved the file. Stage it into the private document review queue.", "Stage for Review", "fulfillment", retrievedAsset.id);
    if (retrievingAsset) return state("retrieving", "Completed Document Available", "APS is retrieving the completed document securely.", "No action required", null);
    if (proofCompleted && transaction.completed_assets_available) return state("available", "Completed Document Available", "Proof reports the completed asset is available. Retrieve it through the existing secure APS control.", "Retrieve Completed Document", "fulfillment");
    if (proofCompleted) return state("completed_waiting", "Notarization Completed", "Proof completed the transaction. APS is waiting for the completed document to become available.", "No action required", null);
    return state("in_progress", "Proof Work in Progress", "Complete the secure notarization in Proof, then return here. APS will synchronize the transaction automatically.", "Continue in Proof", "proof");
  }

  function state(key, title, body, action, tab, documentId = null, attention = false) {
    return { key, title, body, action, tab, documentId, attention };
  }

  return { derive };
});
