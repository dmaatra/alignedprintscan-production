import { serveProofAdmin } from "../_shared/proof/admin-handler.ts";

serveProofAdmin([
  "create_transaction",
  "activate_transaction",
  "retrieve_transaction",
]);
