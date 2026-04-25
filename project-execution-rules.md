**Project Execution Rules**

**Full Project Creation Workflow**

1. User logs in with GitHub
2. User creates a new project and gives it a name
3. This immediately triggers the full **Environment Setup** on Render:
   - Create new workspace under `nebula.dev.ai@gmail.com`
   - Create project + project ID
   - Create PostgreSQL database and get `DATABASE_URL`
   - Copy all Platform Variables
   - Generate `SESSION_SECRET`
   - Set correct GitHub callback URL
   - Store workspace ID and project ID internally
4. Grok Chat begins asking the user questions to understand the project
5. Generate Master Plan
6. Generate Mind Map
7. Trigger Pencil for UI mockups
8. Grok reads all reference files in this exact order: `project-workflow.md` → `master-plan.json` → `environment-setup.md` → `nebula-sysh-ui-sysh-studio.md` → `project-execution-rules.md` (and reviews Secrets and Integrations for the active project)
9. Grok creates a summary of the project, tech stack, and any missing pieces
10. If anything is missing, Grok asks the user before coding
11. Only then does Grok start development following the rules in this file

**Phase 0 – Foundation**
- Read and fully comprehend all files first (`project-workflow.md`, `master-plan.json`, `environment-setup.md`, `nebula-sysh-ui-sysh-studio.md`, `project-execution-rules.md`) and review Secrets and Integrations for the active project
- Create schema / Prisma models based on **Pages and Navigation** tab (including roles and RLS where needed)
- Set up Authentication system (currently GitHub — ask the user if they want additional login methods like Google)
- **Base API Structure**: Analyze existing files. If we are missing any external APIs, Client IDs, secrets or tokens, ask the user in chat what to use and add them to Secrets and Integrations
- Implement proper Error Handling: After each change, run the code. Try to automatically fix errors up to 5 times. If still failing after 5 attempts, store the error and ask the user for intervention.

**Phase 1 – Core Features & Quality Control**
- Build features one by one using **Features & KPIs** as checklist
- Create all backend endpoints
- Verify all required secrets and integrations are present before starting each feature
- Implement Data Processing Logic based on the type of data
- Each feature must pass its KPIs before moving to the next one

**Phase 2 – User Interface**
- Build frontend using Pencil output + `nebula-sysh-ui-sysh-studio.md`
- Implement state management and form validation

**Phase 3 – Polish & User Experience**
- Add loading states, error states, empty states
- Ensure responsive design and basic accessibility
- Handle edge cases

**Phase 4 – Production Readiness**
- Test that every button and page works correctly
- Remove any duplicate or redundant code/pages
- Perform performance optimization
- Run all tests and output a complete report with status for each feature
- Perform final code review and cleanup

You (or Grok) write the Prisma schema in the code.
The workspace + Postgres database is created on Render.
When the code is deployed to that workspace, the schema is automatically applied to the database.

Important:
The person responsible for adding the schema is Grok Code (during Phase 0 – Foundation on Render not other provider
