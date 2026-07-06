import { registerSW } from "virtual:pwa-register";

import { createPwaUpdateController } from "./update-controller";

export const pwaUpdateController = createPwaUpdateController(registerSW);
