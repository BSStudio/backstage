import * as Sentry from "@sentry/nextjs";
import { sentryInitOptions } from "@/lib/observability/sentry";

// Imported by `register()` in instrumentation.ts.
Sentry.init(sentryInitOptions());
