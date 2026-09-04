# BibleOn Supabase

## Connect a project

1. Copy `.env.example` to `.env.local` and set the project URL and publishable key.
2. Install the Supabase CLI or run it through `npx`.
3. Link the local repository with `npx supabase link --project-ref <project-ref>`.
4. Review migrations, then apply them with `npx supabase db push`.
5. Configure the application URL and `/onboarding` callback URL in Auth settings.

Never put an `sb_secret_...` key or the legacy `service_role` key in a Vite environment
variable. Every `VITE_` value is bundled into the client application.

The first migration creates only the account foundation. Reading, church, messaging,
Storage policies, and RAG migrations are added independently in later phases.
