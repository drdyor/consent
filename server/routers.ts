import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { catalogRouter } from "./routers/catalog";
import { consentRouter } from "./routers/consents";
import { marketCatalogueRouter } from "./routers/marketCatalogue";
import { workspaceRouter } from "./routers/workspace";
import { supplierOpsRouter } from "./routers/supplierOps";
import { clinicIntegrationRouter } from "./routers/clinicIntegration";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  workspace: workspaceRouter,
  catalog: catalogRouter,
  marketCatalogue: marketCatalogueRouter,
  consent: consentRouter,
  supplierOps: supplierOpsRouter,
  clinicIntegration: clinicIntegrationRouter,
});

export type AppRouter = typeof appRouter;
