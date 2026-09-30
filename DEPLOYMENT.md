# 🚀 Chandrayaan Lunar Image Registration System — Deployment Guide

This application is composed of two components:
1. **Frontend (Vite + TypeScript SPA)**: Hosted on **Vercel** (Global edge CDN, instant builds).
2. **Backend (FastAPI + OpenCV Python Service)**: Hosted on **Render** (Containerized Python with scientific libraries).

---

## 🛠️ Step 1: Deploy the Python Backend on Render

1. Go to [render.com](https://render.com) and log in.
2. Click **New +** and select **Web Service** (or **Blueprint** using `render.yaml`).
3. Connect your GitHub repository (`Chandracrawl`).
4. Configure the service:
   - **Name**: `chandracrawl-backend`
   - **Language / Runtime**: `Python 3`
   - **Branch**: `main`
   - **Build Command**:
     ```bash
     pip install -r backend/requirements.txt
     ```
   - **Start Command**:
     ```bash
     uvicorn backend.main:app --host 0.0.0.0 --port $PORT
     ```
   - **Instance Type**: `Free` (or standard for heavy rasters)
5. Under **Environment Variables**, add:
   - `PYTHON_VERSION` = `3.10.11`
   - `CORS_ORIGINS` = `*`
6. Click **Deploy Web Service**.
7. Once deployed, copy your backend URL (e.g., `https://chandracrawl-backend.onrender.com`).

---

## ⚡ Step 2: Deploy the Frontend on Vercel

1. Go to [vercel.com](https://vercel.com) and log in.
2. Click **Add New... > Project** and import your repository (`Chandracrawl`).
3. In the project configuration:
   - **Framework Preset**: `Vite`
   - **Root Directory**: Click `Edit` and select `frontend` (or keep `./` since root `vercel.json` is provided).
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Under **Environment Variables**, add:
   - **Key**: `VITE_API_BASE_URL`
   - **Value**: `https://chandracrawl-backend.onrender.com` *(Replace with your Render URL from Step 1)*
5. Click **Deploy**.
6. In ~15 seconds, your mission control dashboard will be live at `https://<your-project>.vercel.app`!

---

## 🔄 Local Development Verification

```bash
# Terminal 1: Backend
python -m uvicorn backend.main:app --port 8000 --reload

# Terminal 2: Frontend
cd frontend
npm run dev
```
Open [http://localhost:5173](http://localhost:5173).
