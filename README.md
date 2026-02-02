
  # CuidAI Hospital Monitoring Interface

  This is a code bundle for CuidAI Hospital Monitoring Interface. The original project is available at https://www.figma.com/design/lBzlZadeYzIi9JltAYkKZo/CuidAI-Hospital-Monitoring-Interface.

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.

  ## Environment variables

  Create a `.env` file based on `.env.example`, or use per-environment files:
  - `.env.development`
  - `.env.qa` (use `vite --mode qa` or `npm run build -- --mode qa`)
  - `.env.production`

  Set:

  - `VITE_API_URL`: Base URL of the backend API (ex: `https://api.seudominio.com`).
    - If not set, the frontend falls back to same-origin requests and logs an error.
  
