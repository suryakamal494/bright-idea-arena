import { getRouter } from "@/router";
import { QueryClient } from "@tanstack/react-query";

// Shared client used by role layouts for cache teardown on sign-out.
export const appQueryClient = new QueryClient();
export { getRouter };
