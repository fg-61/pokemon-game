// Dev server without HMR/live-reload, for headless screenshot runs (tools/shoot.mjs) while files are being edited.
import base from './vite.config';
export default { ...base, server: { ...base.server, port: 5174, hmr: false } };
