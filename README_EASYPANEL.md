# Deployment to Easypanel

This project is configured to be deployed as a single Docker container.

### Step-by-Step for Easypanel:

1. **Connect Repository**: Point Easypanel to your GitHub repository: `https://github.com/onunez2025/valorizaciones.git`.
2. **Setup Domain**: Add your domain (e.g., `valorizaciones.tudominio.com`).
3. **Environment Variables**: Add the following variables in the "Environment" tab of Easypanel:
   - `PORT`: `3000` (optional, defaults to 3000)
   - `DB_USER`: Your Azure SQL user
   - `DB_PASSWORD`: Your Azure SQL password
   - `DB_DATABASE`: `GAC_DB` (or your database name)
   - `DB_SERVER`: Your database server address (e.g. `mtserver.database.windows.net`)
   - `JWT_SECRET`: A secure random string for tokens
4. **Deploy**: Click "Deploy". Easypanel will automatically use the `Dockerfile` to build and serve the application.

The application serves both the React frontend and the Express API on the same port.
