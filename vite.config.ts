import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],
    // Relative asset paths, so the build works wherever it is served
    base: "./",
    server: {
        host: true,
        // card-website uses Vite's default 5173
        port: 5174
    }
});
