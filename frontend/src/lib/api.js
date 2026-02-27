import axios from "axios";

// normalize backend URL (force HTTPS, add protocol if missing)
let backendUrl = process.env.REACT_APP_BACKEND_URL || "";
if (backendUrl && !/^https?:\/\//i.test(backendUrl)) {
  backendUrl = `https://${backendUrl}`;
}
// ensure https scheme
backendUrl = backendUrl.replace(/^http:/i, "https:");
const API_URL = backendUrl.replace(/\/+$/,'') + "/api";

const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("aya_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("aya_token");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

export default api;
