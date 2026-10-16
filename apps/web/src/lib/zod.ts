// Zod tries `Function("")` to compile its checks faster. The pages' security policy forbids that,
// so Chrome reported a refusal on every page. Checks run the plain way instead; import z from here.
import { z } from "zod";

z.config({ jitless: true });

export { z };
