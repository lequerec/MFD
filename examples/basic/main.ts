import { Application } from "../../mod.ts";
import { UsersController } from "./users.controller.ts";

const app = new Application().register(new UsersController());

// Importer ce fichier ne démarre pas de serveur, pratique pour les tests.
if (import.meta.main) app.listen();

export default app;
